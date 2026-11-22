import test from "node:test";
import assert from "node:assert/strict";
import { parseAiChatPayload } from "../cloudflare/worker.js";

test("accepte un message simple et le nettoie", () => {
  assert.deepEqual(parseAiChatPayload({ message: "  Bonjour  " }), {
    ok: true,
    message: "Bonjour"
  });
});

test("refuse un payload absent, non objet ou tableau", () => {
  assert.equal(parseAiChatPayload(null).error, "invalid_payload");
  assert.equal(parseAiChatPayload("bonjour").error, "invalid_payload");
  assert.equal(parseAiChatPayload(["bonjour"]).error, "invalid_payload");
});

test("refuse les messages vides", () => {
  assert.equal(parseAiChatPayload({ message: "   " }).error, "empty_message");
});

test("refuse les messages qui dépassent 2 000 caractères", () => {
  assert.equal(parseAiChatPayload({ message: "a".repeat(2001) }).error, "message_too_long");
});

test("refuse les types de message incorrects", () => {
  assert.equal(parseAiChatPayload({ message: 42 }).error, "invalid_message");
});

test("refuse les champs supplémentaires non autorisés", () => {
  assert.equal(parseAiChatPayload({ message: "Bonjour", role: "admin" }).error, "unsupported_fields");
});
