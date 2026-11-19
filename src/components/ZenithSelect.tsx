import React, {
	Children,
	isValidElement,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	type CSSProperties,
	type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import "./ZenithSelect.css";

interface SelectOptionItem {
	value: string;
	label: ReactNode;
	disabled: boolean;
}

export interface ZenithSelectProps {
	value: string | number;
	onChange: (event: { target: { value: string } }) => void;
	children: ReactNode;
	className?: string;
	disabled?: boolean;
	dir?: "ltr" | "rtl" | "auto";
	style?: CSSProperties;
	"aria-label"?: string;
	title?: string;
	id?: string;
	onOpenChange?: (open: boolean) => void;
}

function collectOptions(nodes: ReactNode, out: SelectOptionItem[]): void {
	Children.forEach(nodes, (child) => {
		if (!isValidElement(child)) return;
		const props = child.props as Record<string, unknown>;
		if (child.type === "option") {
			const rawValue = props.value !== undefined ? String(props.value) : String(props.children ?? "");
			out.push({
				value: rawValue,
				label: props.children as ReactNode,
				disabled: Boolean(props.disabled),
			});
			return;
		}
		if (props.children !== undefined) {
			collectOptions(props.children as ReactNode, out);
		}
	});
}

interface MenuPosition {
	top?: number;
	bottom?: number;
	left?: number;
	right?: number;
	minWidth: number;
	maxWidth: number;
	maxHeight: number;
	placement: "bottom" | "top";
	dir: "ltr" | "rtl";
}

export function ZenithSelect({
	value,
	onChange,
	children,
	className = "",
	disabled = false,
	dir,
	style,
	"aria-label": ariaLabel,
	title,
	id,
	onOpenChange,
}: ZenithSelectProps) {
	const [open, setOpenState] = useState(false);
	const [focusedIndex, setFocusedIndex] = useState(-1);
	const [menuPos, setMenuPos] = useState<MenuPosition | null>(null);

	const triggerRef = useRef<HTMLButtonElement | null>(null);
	const menuRef = useRef<HTMLDivElement | null>(null);

	const options = useMemo(() => {
		const list: SelectOptionItem[] = [];
		collectOptions(children, list);
		return list;
	}, [children]);

	const stringValue = String(value);
	const selectedIndex = options.findIndex((o) => o.value === stringValue);
	const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : options[0];

	const setOpen = useCallback(
		(next: boolean) => {
			setOpenState((prev) => {
				if (prev !== next) {
					onOpenChange?.(next);
				}
				return next;
			});
		},
		[onOpenChange]
	);

	const updatePosition = useCallback(() => {
		const trigger = triggerRef.current;
		if (!trigger) return;
		const rect = trigger.getBoundingClientRect();
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		const margin = 8;
		const gap = 5;

		const computedDir =
			dir === "ltr" || dir === "rtl"
				? dir
				: getComputedStyle(trigger).direction === "rtl"
					? "rtl"
					: "ltr";

		const minWidth = Math.max(rect.width, 132);
		const maxWidth = Math.max(rect.width, Math.min(280, vw - margin * 2));
		const spaceBelow = Math.max(0, vh - rect.bottom - margin - gap);
		const spaceAbove = Math.max(0, rect.top - margin - gap);
		const desiredMax = 240;

		const placement: "bottom" | "top" =
			spaceBelow >= Math.min(desiredMax, 150) || spaceBelow >= spaceAbove ? "bottom" : "top";
		const maxHeight = Math.max(
			96,
			Math.min(desiredMax, placement === "bottom" ? spaceBelow : spaceAbove)
		);

		const pos: MenuPosition = {
			minWidth,
			maxWidth,
			maxHeight,
			placement,
			dir: computedDir,
		};

		if (placement === "bottom") {
			pos.top = rect.bottom + gap;
		} else {
			pos.bottom = vh - rect.top + gap;
		}

		if (computedDir === "rtl") {
			if (rect.right - maxWidth < margin && vw - rect.left - margin > rect.right - margin) {
				pos.left = Math.max(margin, Math.min(rect.left, vw - minWidth - margin));
			} else {
				const rightOffset = Math.max(margin, vw - rect.right);
				pos.right = Math.min(rightOffset, Math.max(margin, vw - minWidth - margin));
			}
		} else {
			if (rect.left + maxWidth > vw - margin && rect.right - margin > vw - rect.left - margin) {
				const rightOffset = Math.max(margin, vw - rect.right);
				pos.right = Math.min(rightOffset, Math.max(margin, vw - minWidth - margin));
			} else {
				const leftOffset = Math.max(margin, rect.left);
				pos.left = Math.min(leftOffset, Math.max(margin, vw - minWidth - margin));
			}
		}

		setMenuPos(pos);
	}, [dir]);

	useLayoutEffect(() => {
		if (!open) {
			setMenuPos(null);
			return;
		}
		updatePosition();
	}, [open, updatePosition, options.length]);

	useEffect(() => {
		if (!open) return;

		const idx = selectedIndex >= 0 ? selectedIndex : options.findIndex((o) => !o.disabled);
		setFocusedIndex(idx);

		const rafId = requestAnimationFrame(() => {
			const menu = menuRef.current;
			if (!menu) return;
			const activeBtn = menu.querySelector<HTMLElement>(".zn-select-option.selected");
			activeBtn?.scrollIntoView({ block: "nearest" });
		});

		const handlePointerDown = (e: PointerEvent) => {
			const target = e.target as Node | null;
			if (!target) return;
			if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) {
				return;
			}
			setOpen(false);
		};

		const handleScroll = (e: Event) => {
			const target = e.target as Node | null;
			if (target && menuRef.current?.contains(target)) return;
			setOpen(false);
		};

		const handleWindowBlur = () => setOpen(false);

		document.addEventListener("pointerdown", handlePointerDown, true);
		window.addEventListener("resize", updatePosition);
		window.addEventListener("scroll", handleScroll, true);
		window.addEventListener("blur", handleWindowBlur);

		return () => {
			cancelAnimationFrame(rafId);
			document.removeEventListener("pointerdown", handlePointerDown, true);
			window.removeEventListener("resize", updatePosition);
			window.removeEventListener("scroll", handleScroll, true);
			window.removeEventListener("blur", handleWindowBlur);
		};
	}, [open, selectedIndex, options, setOpen, updatePosition]);

	const selectOption = useCallback(
		(opt: SelectOptionItem) => {
			if (opt.disabled) return;
			setOpen(false);
			if (opt.value !== stringValue) {
				onChange({ target: { value: opt.value } });
			}
			triggerRef.current?.focus();
		},
		[onChange, setOpen, stringValue]
	);

	const moveFocus = useCallback(
		(step: 1 | -1) => {
			if (options.length === 0) return;
			let next = focusedIndex;
			for (let i = 0; i < options.length; i++) {
				next = (next + step + options.length) % options.length;
				if (!options[next].disabled) {
					setFocusedIndex(next);
					const el = menuRef.current?.querySelectorAll<HTMLElement>(".zn-select-option")[next];
					el?.scrollIntoView({ block: "nearest" });
					return;
				}
			}
		},
		[focusedIndex, options]
	);

	const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
		if (disabled) return;
		if (e.key === "ArrowDown") {
			e.preventDefault();
			if (!open) {
				setOpen(true);
			} else {
				moveFocus(1);
			}
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			if (!open) {
				setOpen(true);
			} else {
				moveFocus(-1);
			}
		} else if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			if (!open) {
				setOpen(true);
			} else if (focusedIndex >= 0 && options[focusedIndex]) {
				selectOption(options[focusedIndex]);
			}
		} else if (e.key === "Escape" && open) {
			e.preventDefault();
			e.stopPropagation();
			setOpen(false);
		} else if (e.key === "Tab" && open) {
			setOpen(false);
		}
	};

	const menuElement =
		open && menuPos
			? createPortal(
					<div
						ref={menuRef}
						role="listbox"
						dir={menuPos.dir}
						className={`zn-select-menu placement-${menuPos.placement}`}
						style={{
							top: menuPos.top !== undefined ? `${menuPos.top}px` : undefined,
							bottom: menuPos.bottom !== undefined ? `${menuPos.bottom}px` : undefined,
							left: menuPos.left !== undefined ? `${menuPos.left}px` : undefined,
							right: menuPos.right !== undefined ? `${menuPos.right}px` : undefined,
							minWidth: `${menuPos.minWidth}px`,
							maxWidth: `${menuPos.maxWidth}px`,
							maxHeight: `${menuPos.maxHeight}px`,
						}}
						onMouseDown={(e) => e.preventDefault()}
					>
						{options.map((opt, idx) => {
							const isSelected = opt.value === stringValue;
							const isFocused = idx === focusedIndex;
							return (
								<button
									key={`${opt.value}-${idx}`}
									type="button"
									role="option"
									aria-selected={isSelected}
									disabled={opt.disabled}
									className={`zn-select-option ${isSelected ? "selected" : ""} ${isFocused ? "focused" : ""}`}
									onMouseEnter={() => {
										if (!opt.disabled) setFocusedIndex(idx);
									}}
									onClick={() => selectOption(opt)}
								>
									<span className="zn-select-option-text">{opt.label}</span>
									{isSelected && <Check size={13} strokeWidth={2.5} className="zn-select-check" />}
								</button>
							);
						})}
					</div>,
					document.body
				)
			: null;

	return (
		<>
			<button
				ref={triggerRef}
				id={id}
				type="button"
				role="combobox"
				aria-expanded={open}
				aria-haspopup="listbox"
				aria-label={ariaLabel}
				title={title}
				dir={dir}
				disabled={disabled}
				style={style}
				className={`zn-select-trigger ${open ? "open" : ""} ${className}`.trim()}
				onClick={() => !disabled && setOpen(!open)}
				onKeyDown={handleKeyDown}
			>
				<span className="zn-select-trigger-label">{selectedOption?.label ?? ""}</span>
				<ChevronDown size={13} strokeWidth={2.2} className="zn-select-chevron" />
			</button>
			{menuElement}
		</>
	);
}
