import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { DesignPlayground } from "./components/DesignPlayground";
import { SupporterPanel } from "./components/SupporterPanel";
import "./styles.css";

const search = new URLSearchParams(window.location.search);
const showDesigner = search.has("designer") || search.has("design");
const showSupporter = search.has("supporter");
const supporterPreview = !("__TAURI_INTERNALS__" in window);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>{showDesigner ? <DesignPlayground /> : showSupporter ? <SupporterPanel preview={supporterPreview} onStatus={() => {}} /> : <App />}</React.StrictMode>,
);
