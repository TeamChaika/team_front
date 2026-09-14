import React from "react";
import ReactDOM from "react-dom/client";
import { MantineProvider, createTheme } from "@mantine/core";
import { BrowserRouter } from "react-router-dom";
import "@mantine/core/styles.css";
import "./styles.css";
import App from "./App";
const theme = createTheme({
  primaryColor: "cyan",
  defaultRadius: "md",
  fontFamily:
    'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  colors: {
    dark: [
      "#dce3ee",
      "#a3b0c3",
      "#74839b",
      "#46536a",
      "#2a374b",
      "#1b273b",
      "#152033",
      "#101a2b",
      "#0c1423",
      "#080f1b",
    ],
  },
});
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </MantineProvider>
  </React.StrictMode>,
);
