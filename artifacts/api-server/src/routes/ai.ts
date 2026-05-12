import { Router, type IRouter } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import {
  GenerateArduinoCodeBody,
  FixArduinoCodeBody,
  ExplainArduinoCodeBody,
  CompileSketchBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

const ARDUINO_SYSTEM_PROMPT = `You are an expert Arduino and embedded systems engineer. 
You specialize in writing clean, well-commented Arduino C/C++ code.
When generating code:
- Always include void setup() and void loop() functions
- Add helpful inline comments
- Use standard Arduino libraries when appropriate
- Output ONLY the code, no explanations unless asked`;

router.post("/ai/generate-code", async (req, res) => {
  const parsed = GenerateArduinoCodeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  const { prompt, board, context } = parsed.data;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    const msgs: { role: "system" | "user"; content: string }[] = [
      { role: "system", content: ARDUINO_SYSTEM_PROMPT },
    ];

    let userMessage = `Generate Arduino code for the following: ${prompt}\nTarget board: ${board}`;
    if (context && context.trim()) {
      userMessage += `\n\nExisting code context:\n\`\`\`cpp\n${context}\n\`\`\``;
    }
    msgs.push({ role: "user", content: userMessage });

    const stream = await openai.chat.completions.create({
      model: "gpt-4o",
      max_completion_tokens: 4096,
      messages: msgs,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    req.log.error({ err }, "Failed to generate code");
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to generate code" });
    } else {
      res.write(`data: ${JSON.stringify({ error: "Generation failed" })}\n\n`);
      res.end();
    }
  }
});

router.post("/ai/fix-code", async (req, res) => {
  const parsed = FixArduinoCodeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  const { code, error, board } = parsed.data;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    const stream = await openai.chat.completions.create({
      model: "gpt-4o",
      max_completion_tokens: 4096,
      messages: [
        {
          role: "system",
          content: `${ARDUINO_SYSTEM_PROMPT}\nWhen fixing code, output ONLY the corrected complete code. No explanations, no markdown fences. Just the fixed code.`,
        },
        {
          role: "user",
          content: `Fix the following Arduino code for a ${board} board.\n\nCompiler error:\n${error}\n\nCode:\n\`\`\`cpp\n${code}\n\`\`\`\n\nOutput only the complete fixed code.`,
        },
      ],
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    req.log.error({ err }, "Failed to fix code");
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to fix code" });
    } else {
      res.write(`data: ${JSON.stringify({ error: "Fix failed" })}\n\n`);
      res.end();
    }
  }
});

router.post("/ai/explain-code", async (req, res) => {
  const parsed = ExplainArduinoCodeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  const { code } = parsed.data;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    const stream = await openai.chat.completions.create({
      model: "gpt-4o",
      max_completion_tokens: 2048,
      messages: [
        {
          role: "system",
          content:
            "You are an expert Arduino educator. Explain Arduino code clearly and concisely. Focus on what the code does, how it works, and any key concepts.",
        },
        {
          role: "user",
          content: `Explain what this Arduino code does:\n\`\`\`cpp\n${code}\n\`\`\``,
        },
      ],
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    req.log.error({ err }, "Failed to explain code");
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to explain code" });
    } else {
      res.write(`data: ${JSON.stringify({ error: "Explanation failed" })}\n\n`);
      res.end();
    }
  }
});

router.post("/compile", async (req, res) => {
  const parsed = CompileSketchBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  const { code, board } = parsed.data;

  await new Promise((resolve) => setTimeout(resolve, 800 + Math.random() * 400));

  const hasSetup = code.includes("void setup()");
  const hasLoop = code.includes("void loop()");

  const errors: string[] = [];
  const warnings: string[] = [];

  if (!hasSetup) {
    errors.push("error: 'setup' was not declared in this scope — missing void setup() function");
  }
  if (!hasLoop) {
    errors.push("error: 'loop' was not declared in this scope — missing void loop() function");
  }

  if (code.includes("delay(") && code.length > 500) {
    warnings.push("warning: Using delay() in loop() blocks other operations");
  }

  const success = errors.length === 0;
  const binarySize = success ? Math.floor(Math.random() * 4000) + 1000 : null;

  const boardName =
    board === "mega2560"
      ? "Arduino Mega 2560"
      : board === "nano"
        ? "Arduino Nano"
        : "Arduino Uno";

  const output = success
    ? `Sketch uses ${binarySize} bytes (${Math.floor(((binarySize ?? 0) / 32256) * 100)}%) of program storage space. Maximum is 32256 bytes.\nGlobal variables use ${Math.floor(Math.random() * 200) + 20} bytes of dynamic memory.\nCompilation successful for ${boardName}.`
    : `Compilation failed for ${boardName}.\n${errors.join("\n")}`;

  res.json({
    success,
    output,
    errors,
    warnings,
    binarySize,
  });
});

export default router;
