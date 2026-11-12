import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { app } from "./config.js";

export const rtdb = getDatabase(app);
