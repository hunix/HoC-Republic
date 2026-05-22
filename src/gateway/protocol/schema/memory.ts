import { Type } from "@sinclair/typebox";

export const MemoryStoreParamsSchema = Type.Object(
  {
    scope: Type.String({ minLength: 1 }),
    content: Type.String({ minLength: 1 }),
    memoryType: Type.Optional(
      Type.Union([
        Type.Literal("fact"),
        Type.Literal("summary"),
        Type.Literal("anchor"),
        Type.Literal("skill"),
        Type.Literal("relationship"),
        Type.Literal("event"),
        Type.Literal("preference"),
      ]),
    ),
    sessionKey: Type.Optional(Type.String()),
    channel: Type.Optional(Type.String()),
    importance: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
  },
  { additionalProperties: false },
);

export const MemorySearchParamsSchema = Type.Object(
  {
    query: Type.String({ minLength: 1 }),
    scope: Type.Optional(Type.String()),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 50 })),
    minImportance: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
    memoryType: Type.Optional(
      Type.Union([
        Type.Literal("fact"),
        Type.Literal("summary"),
        Type.Literal("anchor"),
        Type.Literal("skill"),
        Type.Literal("relationship"),
        Type.Literal("event"),
        Type.Literal("preference"),
      ]),
    ),
  },
  { additionalProperties: false },
);

export const MemoryListParamsSchema = Type.Object(
  {
    scope: Type.Optional(Type.String()),
    memoryType: Type.Optional(Type.String()),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
    offset: Type.Optional(Type.Integer({ minimum: 0 })),
  },
  { additionalProperties: false },
);

export const MemoryRecallParamsSchema = Type.Object(
  {
    scope: Type.String({ minLength: 1 }),
    query: Type.String({ minLength: 1 }),
    maxTokens: Type.Optional(Type.Integer({ minimum: 100, maximum: 8000 })),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 20 })),
  },
  { additionalProperties: false },
);

export const MemoryForgetParamsSchema = Type.Object(
  {
    id: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

export const MemoryStatsParamsSchema = Type.Object(
  {
    scope: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

export const MemoryRegisterSessionParamsSchema = Type.Object(
  {
    scope: Type.String({ minLength: 1 }),
    sessionKey: Type.String({ minLength: 1 }),
    channel: Type.String({ minLength: 1 }),
    displayName: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

export const MemoryGetSessionsParamsSchema = Type.Object(
  {
    scope: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

export const MemoryGraphParamsSchema = Type.Object(
  {
    scope: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);
