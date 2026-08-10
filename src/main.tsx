import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { applyTheme, loadSettings } from "./lib/settings";
import { startOutbox } from "./lib/outbox";
import { registerServiceWorker } from "./lib/registerSW";

applyTheme(loadSettings());
startOutbox();
registerServiceWorker();

createRoot(document.getElementById("root")!).render(<App />);
