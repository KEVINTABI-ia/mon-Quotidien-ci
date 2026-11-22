import test from "node:test";
import assert from "node:assert/strict";
import { parseAiChatPayload } from "../cloudflare/worker.js";

const id = "123e4567-e89b-42d3-a456-426614174000";

test("accepte et nettoie un message avec un identifiant de conversation UUID", () => {
  assert.deepEqual(parseAiChatPayload({ message: "  Bonjour  ", conversationId: id }), { ok: true, message: "Bonjour", conversationId: id });
});
test("refuse un payload absent, non objet ou tableau", () => {
  assert.equal(parseAiChatPayload(null).error, "invalid_payload");
  assert.equal(parseAiChatPayload("bonjour").error, "invalid_payload");
  assert.equal(parseAiChatPayload(["bonjour"]).error, "invalid_payload");
});
test("refuse les messages vides", () => assert.equal(parseAiChatPayload({ message: "   ", conversationId: id }).error, "empty_message"));
test("refuse les messages de plus de 2 000 caractères", () => assert.equal(parseAiChatPayload({ message: "a".repeat(2001), conversationId: id }).error, "message_too_long"));
test("refuse les types de message incorrects", () => assert.equal(parseAiChatPayload({ message: 42, conversationId: id }).error, "invalid_message"));
test("refuse les champs supplémentaires", () => assert.equal(parseAiChatPayload({ message: "Bonjour", conversationId: id, role: "admin" }).error, "unsupported_fields"));
test("exige un identifiant UUID de conversation", () => {
  assert.equal(parseAiChatPayload({ message: "Bonjour" }).error, "invalid_conversation_id");
  assert.equal(parseAiChatPayload({ message: "Bonjour", conversationId: "not-an-id" }).error, "invalid_conversation_id");
});
