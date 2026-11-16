import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useI18n } from "../i18n";
import {
	ChevronLeft,
	LoaderCircle,
	Lock,
	MapPin,
	RefreshCw,
	Wifi,
	WifiHigh,
	WifiLow,
	WifiZero
} from "lucide-react";
import "./QuickPanel.css";

interface WifiNetwork {
	ssid: string;
	signal: number;
	security: string;
	connected: boolean;
	saved: boolean;
}

interface WifiNetworkList {
	networks: WifiNetwork[];
	location_denied: boolean;
}

// Personal networks take a typed password; anything else that isn't open
// (work networks with sign-in, WEP) is handed to Windows Settings.
const PERSONAL = new Set(["wpa", "wpa2", "wpa3"]);

const ERROR_TEXT: Record<string, string> = {
	"wrong-password": "Wrong password",
	"password-required": "Enter the password",
	"password-length": "Wi-Fi passwords are 8 to 63 characters",
	unsupported: "Connect to this network in Windows Settings",
	"not-found": "This network is out of range",
	timeout: "Couldn't connect in time",
	"no-adapter": "No Wi-Fi adapter found",
	"location-denied": "Location access is off"
};

function SignalIcon({ signal }: { signal: number }) {
	if (signal >= 75) return <Wifi />;
	if (signal >= 50) return <WifiHigh />;
	if (signal >= 25) return <WifiLow />;
	return <WifiZero />;
}

interface WifiPanelProps {
	enabled: boolean;
	onToggle: () => void;
	onBack: () => void;
	/** Keeps the notch open while a password is being typed. */
	onPinChange: (pinned: boolean) => void;
}

export function WifiPanel({ enabled, onToggle, onBack, onPinChange }: WifiPanelProps) {
	const { t, dir } = useI18n();
	const w = t.quickPanels.wifi;
	const backLabel = t.quickPanels.backToControls;
	const [list, setList] = useState<WifiNetworkList | null>(null);
	const [scanning, setScanning] = useState(false);
	const [selected, setSelected] = useState<string | null>(null);
	// A saved network whose stored password stopped working also gets a field.
	const [askPassword, setAskPassword] = useState<string | null>(null);
	const [password, setPassword] = useState("");
	const [busy, setBusy] = useState<string | null>(null);
	const [error, setError] = useState<{ ssid: string; text: string } | null>(null);
	const scanFallback = useRef<number | null>(null);

	const refresh = useCallback(async () => {
		try {
			setList(await invoke<WifiNetworkList>("wifi_list_networks"));
		} catch (e) {
			console.error("[wifi] list failed:", e);
			setList({ networks: [], location_denied: false });
		}
	}, []);

	const scan = useCallback(async () => {
		setScanning(true);
		if (scanFallback.current !== null) window.clearTimeout(scanFallback.current);
		// Results arrive as a wifi-changed event; stop the spinner regardless.
		scanFallback.current = window.setTimeout(() => setScanning(false), 8000);
		try {
			await invoke("wifi_scan");
		} catch (e) {
			console.error("[wifi] scan failed:", e);
			setScanning(false);
		}
	}, []);

	useEffect(() => {
		if (!enabled) return;
		void refresh();
		void scan();
	}, [enabled, refresh, scan]);

	useEffect(() => {
		let debounce: number | null = null;
		const unlisten = listen("wifi-changed", () => {
			if (debounce !== null) window.clearTimeout(debounce);
			debounce = window.setTimeout(() => {
				debounce = null;
				setScanning(false);
				void refresh();
			}, 250);
		});
		return () => {
			if (debounce !== null) window.clearTimeout(debounce);
			if (scanFallback.current !== null) window.clearTimeout(scanFallback.current);
			unlisten.then((f) => f());
			onPinChange(false);
		};
	}, [refresh, onPinChange]);

	const collapse = () => {
		setSelected(null);
		setAskPassword(null);
		setPassword("");
		setError(null);
		onPinChange(false);
	};

	const toggleRow = (ssid: string) => {
		if (selected === ssid) {
			collapse();
			return;
		}
		collapse();
		setSelected(ssid);
	};

	const connect = async (network: WifiNetwork, withPassword: boolean) => {
		setBusy(network.ssid);
		setError(null);
		try {
			await invoke("wifi_connect", {
				ssid: network.ssid,
				password: withPassword ? password : null
			});
			collapse();
		} catch (e) {
			const code = String(e);
			if (network.saved && PERSONAL.has(network.security) && !withPassword) {
				setAskPassword(network.ssid);
			}
			setError({ ssid: network.ssid, text: w.errors[code] ?? ERROR_TEXT[code] ?? code });
		} finally {
			setBusy(null);
			void refresh();
		}
	};

	const disconnect = async () => {
		try {
			await invoke("wifi_disconnect");
			collapse();
		} catch (e) {
			console.error("[wifi] disconnect failed:", e);
		}
	};

	const forget = async (network: WifiNetwork) => {
		try {
			await invoke("wifi_forget", { ssid: network.ssid });
			collapse();
			void refresh();
		} catch (e) {
			const code = String(e);
			setError({ ssid: network.ssid, text: w.errors[code] ?? ERROR_TEXT[code] ?? code });
		}
	};

	const statusText = (n: WifiNetwork) => {
		if (busy === n.ssid) return w.connecting;
		if (n.connected) return w.connected;
		if (n.saved) return w.saved;
		return n.security === "open" ? w.open : w.secured;
	};

	const renderActions = (n: WifiNetwork) => {
		const isBusy = busy === n.ssid;
		const needsPassword = (!n.saved && PERSONAL.has(n.security)) || askPassword === n.ssid;
		const handledByWindows = !n.saved && n.security !== "open" && !PERSONAL.has(n.security);

		if (handledByWindows) {
			return (
				<div className="qp-row-actions">
					<span className="qp-note">{w.portalNote}</span>
					<button className="qp-btn" onClick={() => invoke("wifi_open_settings", { page: "wifi" })}>
						{w.openSettings}
					</button>
				</div>
			);
		}

		return (
			<div className="qp-row-actions">
				{needsPassword && !n.connected && (
					<input
						className="qp-input"
						type="password"
						placeholder={w.passwordPlaceholder}
						autoFocus
						value={password}
						disabled={isBusy}
						onChange={(e) => setPassword(e.target.value)}
						onFocus={() => onPinChange(true)}
						onBlur={() => onPinChange(false)}
						onKeyDown={(e) => {
							e.stopPropagation();
							if (e.key === "Enter" && password) void connect(n, true);
							if (e.key === "Escape") collapse();
						}}
					/>
				)}
				<div className="qp-btn-row">
					{n.connected ? (
						<button className="qp-btn" onClick={disconnect}>
							{w.disconnect}
						</button>
					) : (
						<button
							className="qp-btn primary"
							disabled={isBusy || (needsPassword && !password)}
							onClick={() => void connect(n, needsPassword)}
						>
							{isBusy ? <LoaderCircle className="qp-spin" /> : w.connect}
						</button>
					)}
					{n.saved && (
						<button className="qp-btn" disabled={isBusy} onClick={() => void forget(n)}>
							{w.forget}
						</button>
					)}
				</div>
			</div>
		);
	};

	const renderBody = () => {
		if (!enabled) return <div className="qp-empty">{w.off}</div>;
		if (list?.location_denied) {
			return (
				<div className="qp-empty">
					<MapPin />
					<span>{w.locationDenied}</span>
					<button
						className="qp-btn"
						onClick={() => invoke("wifi_open_settings", { page: "location" })}
					>
						{w.openLocationSettings}
					</button>
				</div>
			);
		}
		if (list === null) {
			return (
				<div className="qp-empty">
					<LoaderCircle className="qp-spin" />
				</div>
			);
		}
		if (list.networks.length === 0) {
			return (
				<div className="qp-empty">{scanning ? w.looking : w.noNetworks}</div>
			);
		}
		return (
			<ul className="qp-list">
				{list.networks.map((n) => {
					const expanded = selected === n.ssid;
					return (
						<li
							key={n.ssid}
							className={`qp-row ${expanded ? "expanded" : ""} ${n.connected ? "active" : ""}`}
						>
							<button
								className="qp-row-main"
								onClick={() => toggleRow(n.ssid)}
								aria-expanded={expanded}
							>
								<span className="qp-row-icon">
									<SignalIcon signal={n.signal} />
								</span>
								<span className="qp-row-text">
									<span className="qp-row-name">{n.ssid}</span>
									<span className="qp-row-sub">{statusText(n)}</span>
								</span>
								{n.security !== "open" && <Lock className="qp-row-badge" />}
							</button>
							{expanded && renderActions(n)}
							{error?.ssid === n.ssid && <div className="qp-error">{error.text}</div>}
						</li>
					);
				})}
			</ul>
		);
	};

	return (
		<div className="qp" dir={dir} onClick={(e) => e.stopPropagation()}>
			<div className="qp-header">
				<button className="qp-icon-btn" onClick={onBack} aria-label={backLabel}>
					<ChevronLeft />
				</button>
				<span className="qp-title">{w.title}</span>
				<button
					className="qp-icon-btn"
					onClick={() => void scan()}
					disabled={!enabled || scanning}
					aria-label={w.scanAria}
				>
					<RefreshCw className={scanning ? "qp-spin" : ""} />
				</button>
				<button
					className={`qp-switch ${enabled ? "on" : ""}`}
					role="switch"
					aria-checked={enabled}
					aria-label={w.title}
					onClick={onToggle}
				>
					<span />
				</button>
			</div>
			<div className="qp-body">{renderBody()}</div>
			<button className="qp-footer" onClick={() => invoke("wifi_open_settings", { page: "wifi" })}>
				{w.moreSettings}
			</button>
		</div>
	);
}
