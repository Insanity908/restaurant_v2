import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { applyTheme, loadSettings } from "./lib/settings";

applyTheme(loadSettings());

createRoot(document.getElementById("root")!).render(<App />);
