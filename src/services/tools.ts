import { FunctionDeclaration, Type } from "@google/genai";

export const calculatorTool: FunctionDeclaration = {
  name: "calculate",
  description: "Perform basic mathematical calculations.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      operation: {
        type: Type.STRING,
        enum: ["add", "subtract", "multiply", "divide"],
        description: "The mathematical operation to perform.",
      },
      a: { type: Type.NUMBER, description: "First operand." },
      b: { type: Type.NUMBER, description: "Second operand." },
    },
    required: ["operation", "a", "b"],
  },
};

export const calendarTool: FunctionDeclaration = {
  name: "getCalendarEvents",
  description: "Get calendar events for a specific date.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      date: { type: Type.STRING, description: "The date in YYYY-MM-DD format." },
    },
    required: ["date"],
  },
};

export const tools = [calculatorTool, calendarTool];

export async function executeTool(name: string, args: any) {
  if (name === "calculate") {
    const { operation, a, b } = args;
    switch (operation) {
      case "add": return { result: a + b };
      case "subtract": return { result: a - b };
      case "multiply": return { result: a * b };
      case "divide": return { result: b !== 0 ? a / b : "Cannot divide by zero" };
      default: return { error: "Unknown operation" };
    }
  }
  if (name === "getCalendarEvents") {
    // Mock implementation
    return { events: [{ title: "Meeting", time: "10:00 AM" }, { title: "Lunch", time: "1:00 PM" }] };
  }
  return { error: "Unknown tool" };
}
