let raw = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) {
  raw += chunk;
}

const request = JSON.parse(raw);
const value = request.input?.value ?? "";

process.stdout.write(
  JSON.stringify({
    ok: true,
    output: {
      echoed: value,
      tool_name: request.tool_name,
      token_present: process.env.GOD_CODE_EXECUTABLE_PLUGIN_TOKEN !== undefined
    }
  })
);
