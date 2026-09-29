import React from "react";
import ReactDOM from "react-dom/client";
import { ProviderUsagePrototype } from "./ProviderUsagePrototype";
import "../styles/index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ProviderUsagePrototype />
  </React.StrictMode>,
);
