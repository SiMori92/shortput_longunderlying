import { seedData } from "../src/data/seed";
seedData().then(counts => console.info("Seed ready:", counts)).catch(error => { console.error(error); process.exitCode = 1; });
