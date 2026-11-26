"""Read a PDF or the attached PDF content of a DER CMS SignedData envelope.

This extracts content only. It does not verify signatures or certificates.
Only definite-length DER with primitive PDF eContent is supported.
"""


def pdf_payload(data: bytes) -> tuple[bytes, bool]:
    if data.lstrip()[:8].startswith(b"%PDF-"):
        return data, False
    message = "Это не PDF. Загрузите исходный отчёт ПКБ или ГКБ."

    def tlv(pos, limit, expected):
        if pos + 2 > limit or data[pos] != expected:
            raise ValueError(message)
        length, start = data[pos + 1], pos + 2
        if length & 128:
            count = length & 127
            if not 1 <= count <= 4 or start + count > limit:
                raise ValueError(message)
            length = int.from_bytes(data[start:start + count], "big")
            start += count
        end = start + length
        if end > limit:
            raise ValueError(message)
        return start, end

    try:
        root, root_end = tlv(0, len(data), 0x30)
        if root_end != len(data):
            raise ValueError(message)
        oid, oid_end = tlv(root, root_end, 0x06)
        if data[oid:oid_end] != bytes.fromhex("2a864886f70d010702"):
            raise ValueError(message)
        explicit, explicit_end = tlv(oid_end, root_end, 0xA0)
        signed, signed_end = tlv(explicit, explicit_end, 0x30)
        if explicit_end != root_end or signed_end != explicit_end:
            raise ValueError(message)
        _, version_end = tlv(signed, signed_end, 0x02)
        _, algorithms_end = tlv(version_end, signed_end, 0x31)
        content, content_end = tlv(algorithms_end, signed_end, 0x30)
        content_oid, content_oid_end = tlv(content, content_end, 0x06)
        if data[content_oid:content_oid_end] != bytes.fromhex("2a864886f70d010701"):
            raise ValueError(message)
        wrapped, wrapped_end = tlv(content_oid_end, content_end, 0xA0)
        payload, payload_end = tlv(wrapped, wrapped_end, 0x04)
        if wrapped_end != content_end or payload_end != wrapped_end:
            raise ValueError(message)
        pdf = data[payload:payload_end]
        if not pdf.startswith(b"%PDF-"):
            raise ValueError(message)
        return pdf, True
    except (IndexError, OverflowError) as exc:
        raise ValueError(message) from exc
