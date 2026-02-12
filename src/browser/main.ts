import { inject } from "@vercel/analytics";
import { initApp } from "./app";
import "./style.css";

inject();

window.addEventListener("DOMContentLoaded", () => {
	initApp();
});
