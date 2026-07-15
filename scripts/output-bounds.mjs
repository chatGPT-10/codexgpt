function utf8Prefix(buffer, maxBytes) {
  let end = Math.min(buffer.byteLength, Math.max(0, maxBytes));
  while (end > 0 && end < buffer.byteLength && (buffer[end] & 0xc0) === 0x80) {
    end -= 1;
  }
  return buffer.subarray(0, end).toString('utf8');
}

export function trimUtf8Bytes(value, maxBytes) {
  const limit = Math.max(0, Math.floor(Number(maxBytes) || 0));
  const text = String(value);
  const buffer = Buffer.from(text, 'utf8');
  if (buffer.byteLength <= limit) return { text, truncated: false };

  const marker = `\n...[output truncated to ${limit} bytes]`;
  const markerBuffer = Buffer.from(marker, 'utf8');
  if (markerBuffer.byteLength >= limit) {
    return { text: utf8Prefix(markerBuffer, limit), truncated: true };
  }

  const prefix = utf8Prefix(buffer, limit - markerBuffer.byteLength);
  return { text: `${prefix}${marker}`, truncated: true };
}

export function boundedTextArtifact(header, detail, maxBytes) {
  return trimUtf8Bytes(`${header}\n\n${String(detail)}\n`, maxBytes).text;
}
