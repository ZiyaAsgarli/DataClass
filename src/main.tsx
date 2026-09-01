import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "@/i18n";
import { AuthProvider } from "@/context/AuthContext";
import "./styles/globals.css";

const savedTheme = localStorage.getItem("dataclass-theme");
const initialTheme =
  savedTheme === "dark" || savedTheme === "light"
    ? savedTheme
    : window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
document.documentElement.classList.toggle("dark", initialTheme === "dark");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
);
