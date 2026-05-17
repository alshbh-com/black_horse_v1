import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import QRCode from 'react-qr-code';

interface Props {
  value: string;
  qrValue?: string;
  showQR?: boolean;
  showBarcode?: boolean;
  height?: number;
  qrSize?: number;
  fontSize?: number;
}

export default function OrderBarcode({
  value,
  qrValue,
  showQR = true,
  showBarcode = true,
  height = 50,
  qrSize = 80,
  fontSize = 14,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (showBarcode && svgRef.current && value) {
      try {
        JsBarcode(svgRef.current, String(value), {
          format: 'CODE128',
          height,
          width: 1.6,
          fontSize,
          displayValue: true,
          margin: 4,
          background: '#ffffff',
          lineColor: '#000000',
        });
      } catch (e) {
        // ignore invalid barcode
      }
    }
  }, [value, height, fontSize, showBarcode]);

  if (!value) return null;

  return (
    <div className="flex items-center justify-center gap-3 flex-wrap bg-white p-2 rounded">
      {showBarcode && <svg ref={svgRef} />}
      {showQR && (
        <div style={{ background: '#fff', padding: 4 }}>
          <QRCode value={qrValue || String(value)} size={qrSize} />
        </div>
      )}
    </div>
  );
}
