const { createApp } = require("./app");
const { port } = require("./config");

const app = createApp();

app.listen(port, () => {
  console.log(`Address conversion server listening on port ${port}`);
});
