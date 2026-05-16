import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Prevent non-Error unhandled rejections from crashing the dev overlay.
// All real errors are caught and displayed within the UI.
window.addEventListener("unhandledrejection", (event) => {
  if (!(event.reason instanceof Error)) {
    event.preventDefault();
  }
});

createRoot(document.getElementById("root")!).render(<App />);
