import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "katex/dist/katex.min.css";
import "@knowledge/renderer-web/styles.css";
import "./site.css";
import App from "./App";

/**
 * The published reader — five projections (read / slides / course /
 * dashboard / paper) of the same compiled IR. Content and static datasets
 * are bundled at build time from content/; `npm run check:content` gates
 * the build, so a document with IR errors never reaches this point.
 */

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
