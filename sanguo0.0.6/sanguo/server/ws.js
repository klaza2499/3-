'use strict';
// WebSocket เซิร์ฟเวอร์ขั้นต่ำ (ไม่ต้องติดตั้งแพ็กเกจเพิ่ม) รองรับเฉพาะข้อความ text
const crypto = require('crypto');
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function attach(httpServer, onConn) {
  httpServer.on('upgrade', (req, socket) => {
    const key = req.headers['sec-websocket-key'];
    if (!key || (req.headers.upgrade || '').toLowerCase() !== 'websocket') { socket.destroy(); return; }
    const acc = crypto.createHash('sha1').update(key + GUID).digest('base64');
    socket.write(['HTTP/1.1 101 Switching Protocols', 'Upgrade: websocket', 'Connection: Upgrade', 'Sec-WebSocket-Accept: ' + acc, '', ''].join('\r\n'));
    socket.setNoDelay(true);
    onConn(new Conn(socket));
  });
}

class Conn {
  constructor(socket) {
    this.socket = socket; this.buf = Buffer.alloc(0); this.frag = null; this.open = true; this.handlers = { message: [], close: [] };
    this.alive = true;
    socket.on('data', (d) => { this.buf = Buffer.concat([this.buf, d]); try { this.parse(); } catch (e) { this.close(); } });
    socket.on('close', () => this.fin()); socket.on('error', () => this.fin());
  }
  on(ev, fn) { this.handlers[ev].push(fn); }
  fin() { if (!this.open) return; this.open = false; this.handlers.close.forEach((f) => f()); }
  parse() {
    for (;;) {
      const b = this.buf; if (b.length < 2) return;
      const fin = (b[0] & 0x80) !== 0, op = b[0] & 0x0f, masked = (b[1] & 0x80) !== 0; let len = b[1] & 0x7f, off = 2;
      if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (b.length < 10) return; len = Number(b.readBigUInt64BE(2)); off = 10; }
      if (len > 1 << 20) throw new Error('too big');
      if (masked) off += 4;
      if (b.length < off + len) return;
      let payload = b.subarray(off, off + len);
      if (masked) { const m = b.subarray(off - 4, off); const out = Buffer.alloc(len); for (let i = 0; i < len; i++) out[i] = payload[i] ^ m[i & 3]; payload = out; }
      this.buf = b.subarray(off + len);
      if (op === 8) { this.close(); return; }
      if (op === 9) { this.raw(0x8a, payload); continue; }
      if (op === 10) { this.alive = true; continue; }
      if (op === 1 || op === 2) this.frag = { op, parts: [payload] };
      else if (op === 0 && this.frag) this.frag.parts.push(payload);
      else continue;
      if (fin && this.frag) { const msg = Buffer.concat(this.frag.parts).toString('utf8'); this.frag = null; this.handlers.message.forEach((f) => f(msg)); }
    }
  }
  raw(first, payload) {
    if (!this.open) return;
    const n = payload.length; let h;
    if (n < 126) h = Buffer.from([first, n]);
    else if (n < 65536) { h = Buffer.alloc(4); h[0] = first; h[1] = 126; h.writeUInt16BE(n, 2); }
    else { h = Buffer.alloc(10); h[0] = first; h[1] = 127; h.writeBigUInt64BE(BigInt(n), 2); }
    try { this.socket.write(Buffer.concat([h, payload])); } catch (e) {}
  }
  send(str) { this.raw(0x81, Buffer.from(str, 'utf8')); }
  ping() { this.alive = false; this.raw(0x89, Buffer.alloc(0)); }
  close() { if (!this.open) return; this.raw(0x88, Buffer.alloc(0)); try { this.socket.end(); } catch (e) {} this.fin(); }
}
module.exports = { attach };
