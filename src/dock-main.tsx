import React from "react";
import ReactDOM from "react-dom/client";
import Dock from "./Dock";
import { LanguageProvider } from "./i18n";
import "./Dock.css";

document.addEventListener("contextmenu", (e) => e.preventDefault());

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
	<React.StrictMode>
		<LanguageProvider>
			<Dock />
		</LanguageProvider>
	</React.StrictMode>
);
