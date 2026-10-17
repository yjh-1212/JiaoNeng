import { database } from "./db.mjs";
import { seed } from "./seed.mjs";
const db = database();
seed(db);
console.log("业务种子已检查；已有数据库不会被覆盖");
db.close();
