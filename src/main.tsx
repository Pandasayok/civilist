import {StrictMode} from "react";
import {createRoot} from "react-dom/client";
import {ThemeProvider} from "next-themes";
import Civilist from "../app/Civilist";
import Login from "./Login";
import "../app/globals.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode><ThemeProvider attribute="class" forcedTheme="light">
    {window.location.pathname === "/login" ? <Login/> : <Civilist initial={null}/>}
  </ThemeProvider></StrictMode>,
);
