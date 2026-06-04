import { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Upload, FileText, CheckCircle, AlertCircle, Download } from 'lucide-react';
import { profileApi } from '../../api/profile.api';

const CSV_TEMPLATE = `productName,genericName,category,unit,price,currency,stock,supplierSku
Amoxicillin 500mg Capsules,Amoxicillin,antibiotics,pack,45.00,SAR,200,AMX-500-CAP
Panadol 500mg Tablets,Paracetamol,analgesic,box,12.50,SAR,500,PAN-500-TAB
Omeprazole 20mg Capsules,Omeprazole,gastrointestinal,pack,28.00,SAR,150,OMP-20-CAP`;

export default function BulkImportPage() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<any>(null);

  const importMutation = useMutation({
    mutationFn: () => profileApi.importCatalogCsv(file!),
    onSuccess: (res) => {
      setResult(res.data);
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      qc.invalidateQueries({ queryKey: ['supplier-catalog'] });
    },
  });

  const downloadTemplate = () => {
    const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'medipulse-catalog-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Bulk Catalog Import</h1>
        <p className="text-gray-500 text-sm mt-1">Upload a CSV to add or update your product catalog in bulk.</p>
      </div>

      {/* Template download */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 flex items-start gap-4">
        <FileText size={20} className="text-blue-600 mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium text-blue-800">Required CSV format</p>
          <p className="text-xs text-blue-600 mt-1">
            Headers: <code className="bg-blue-100 px-1 rounded">productName, genericName, category, unit, price, currency, stock, supplierSku</code>
          </p>
          <p className="text-xs text-blue-500 mt-1">
            Only <code>productName</code>, <code>category</code>, <code>unit</code>, and <code>price</code> are required.
          </p>
        </div>
        <button
          onClick={downloadTemplate}
          className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 shrink-0"
        >
          <Download size={14} /> Template
        </button>
      </div>

      {/* Upload area */}
      <div
        className="border-2 border-dashed border-gray-300 rounded-xl p-10 text-center cursor-pointer hover:border-blue-400 transition-colors"
        onClick={() => fileRef.current?.click()}
      >
        <Upload size={32} className="mx-auto mb-3 text-gray-400" />
        {file ? (
          <div>
            <p className="font-medium text-gray-800">{file.name}</p>
            <p className="text-sm text-gray-500 mt-1">{(file.size / 1024).toFixed(1)} KB — ready to import</p>
          </div>
        ) : (
          <div>
            <p className="text-gray-600 font-medium">Click to select a CSV file</p>
            <p className="text-sm text-gray-400 mt-1">Max 5 MB</p>
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setResult(null);
          }}
        />
      </div>

      <button
        onClick={() => importMutation.mutate()}
        disabled={!file || importMutation.isPending}
        className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        <Upload size={16} />
        {importMutation.isPending ? 'Importing…' : 'Import Catalog'}
      </button>

      {/* Result */}
      {result && (
        <div className={`rounded-xl border p-6 space-y-4 ${result.errors?.length > 0 ? 'border-orange-200 bg-orange-50' : 'border-green-200 bg-green-50'}`}>
          <div className="flex items-center gap-2">
            {result.errors?.length === 0 ? (
              <CheckCircle size={20} className="text-green-600" />
            ) : (
              <AlertCircle size={20} className="text-orange-500" />
            )}
            <h3 className="font-semibold text-gray-900">Import Complete</h3>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: 'Total rows',  value: result.total,    color: 'text-gray-900' },
              { label: 'Imported',    value: result.imported, color: 'text-green-700' },
              { label: 'Skipped',     value: result.skipped,  color: 'text-orange-600' },
              { label: 'Need mapping',value: result.unmapped, color: 'text-blue-600' },
            ].map(({ label, value, color }) => (
              <div key={label} className="text-center">
                <p className={`text-2xl font-bold ${color}`}>{value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {result.unmapped > 0 && (
            <p className="text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-lg p-3">
              {result.unmapped} product(s) need admin review for canonical mapping. They are imported but flagged.
            </p>
          )}

          {result.errors?.length > 0 && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Row errors:</p>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {result.errors.map((e: any, i: number) => (
                  <p key={i} className="text-xs text-red-600">Row {e.row}: {e.reason}</p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
