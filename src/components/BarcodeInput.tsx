import { useState } from 'react';
import { Barcode, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { inventoryApi } from '../api/inventory.api';

interface BarcodeResult {
  found:        boolean;
  source:       string;
  productId?:   string;
  name?:        string;
  genericName?: string;
  manufacturer?: string;
  strength?:    string;
  dosageForm?:  string;
  category?:    string;
  unit?:        string;
}

interface Props {
  onFound: (result: BarcodeResult) => void;
  placeholder?: string;
}

/**
 * Barcode input — type a barcode number → auto-fills product details.
 * Checks local DB first, then Open Food Facts global database.
 * If found in local DB, returns productId ready to use.
 * If found externally, returns pre-filled fields for confirmation.
 */
export function BarcodeInput({ onFound, placeholder = 'Type or scan barcode (e.g. 6281002090037)' }: Props) {
  const [barcode, setBarcode] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BarcodeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const lookup = async () => {
    if (!barcode.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await inventoryApi.lookupBarcode(barcode.trim());
      const data = res.data as BarcodeResult;
      setResult(data);
      if (data.found) {
        onFound(data);
      } else {
        setError('Product not found in database. Fill in manually or try another barcode.');
      }
    } catch {
      setError('Barcode lookup failed. Fill in product details manually.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Barcode size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && lookup()}
            placeholder={placeholder}
            className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button
          type="button"
          onClick={lookup}
          disabled={!barcode.trim() || loading}
          className="px-3 py-2 text-sm bg-gray-700 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 flex items-center gap-1.5"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Barcode size={14} />}
          Lookup
        </button>
      </div>

      {result?.found && (
        <div className="flex items-start gap-2 p-2.5 bg-green-50 border border-green-200 rounded-lg text-sm">
          <CheckCircle size={15} className="text-green-600 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="font-medium text-green-800">{result.name}</p>
            {result.genericName && <p className="text-green-600 text-xs">{result.genericName}</p>}
            {result.manufacturer && <p className="text-green-500 text-xs">{result.manufacturer}</p>}
            <p className="text-green-500 text-xs mt-0.5">
              Source: {result.source === 'local_db' ? 'MediPulse database ✓' : 'External lookup'}
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
          <AlertCircle size={14} className="shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
}
