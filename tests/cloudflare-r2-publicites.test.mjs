import test from "node:test";
import assert from "node:assert/strict";
import { detectPubliciteImage, publiciteKeyValid } from "../cloudflare/worker.js";

test("detects real JPG, PNG and WebP signatures", () => {
  assert.equal(detectPubliciteImage(Uint8Array.from([0xff,0xd8,0xff,0x00])).type, "image/jpeg");
  assert.equal(detectPubliciteImage(Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])).type, "image/png");
  assert.equal(detectPubliciteImage(Uint8Array.from([..."RIFF"].map(c=>c.charCodeAt(0)).concat([0,0,0,0,...[..."WEBP"].map(c=>c.charCodeAt(0))]))).type, "image/webp");
  assert.equal(detectPubliciteImage(Uint8Array.from([0x00,0x01,0x02])), null);
});

test("accepts only an image object key owned by the paying partner", () => {
  const uid = "partner-user-123";
  const key = "publicites/partenaires/"+uid+"/123e4567-e89b-12d3-a456-426614174000.jpg";
  assert.equal(publiciteKeyValid(key, uid), true);
  assert.equal(publiciteKeyValid(key, "another-user"), false);
  assert.equal(publiciteKeyValid(key.replace(".jpg",".mp4"), uid), false);
  assert.equal(publiciteKeyValid("publicites/partenaires/"+uid+"/../secret.jpg", uid), false);
});
