import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
const DesignPlayground = import.meta.env.DEV ? React.lazy(() => import("./components/DesignPlayground").then((module) => ({ default: module.DesignPlayground }))) : null;
import { QuotaSourcesPanel, SupporterPanel } from "./components/SupporterPanel";
import "./styles.css";

const search = new URLSearchParams(window.location.search);
const showDesigner = import.meta.env.DEV && (search.has("designer") || search.has("design"));
const showSupporter = search.has("supporter");
const showSources = search.has("sources");
const supporterPreview = !("__TAURI_INTERNALS__" in window);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>{showDesigner && DesignPlayground ? <React.Suspense fallback={null}><DesignPlayground /></React.Suspense> : showSources ? <QuotaSourcesPanel preview={supporterPreview} /> : showSupporter ? <SupporterPanel preview={supporterPreview} onStatus={() => {}} /> : <App />}</React.StrictMode>,
);
