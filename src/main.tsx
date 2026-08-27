import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "@/i18n";
import { AuthProvider } from "@/context/AuthContext";
import "./styles/globals.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
);
