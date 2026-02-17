"use client";

import React, { useState } from "react";
import { downloadOrderPdf, downloadOrdersPdf } from "@/lib/pdf-utils";
import type { Order } from "@/lib/db-types";

/**
 * Test page for verifying PDF download functionality.
 * This page helps debug PDF generation and download issues.
 */
export default function TestPdfPage() {
  const [status, setStatus] = useState<string>("");
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `[${timestamp}] ${message}`;
    setLogs((prev) => [...prev, logEntry]);
    console.log(logEntry);
  };

  // Mock order for testing
  const mockOrder: Order = {
    id: "test-order-123",
    user_id: "test-user",
    recipient_details: "Test Recipient\n123 Test Street\nTest City, 12345",
    sender_details: "Test Sender\n456 Sender Ave\nSender City, 67890",
    booking_date: new Date().toISOString(),
    despatch_date: null,
    quantity: 5,
    courier_name: "Test Courier",
    status: "PENDING",
    booked_by: "Test Staff",
    booked_mobile_no: "1234567890",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const mockOrders: Order[] = [mockOrder, { ...mockOrder, id: "test-order-456" }];

  const testSingleOrder = async () => {
    addLog("Testing single order PDF download...");
    setStatus("Testing single order...");
    try {
      await downloadOrderPdf(mockOrder);
      addLog("✓ Single order PDF download triggered");
      setStatus("Success! Check your downloads or browser console.");
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : "Unknown error";
      addLog(`✗ Single order PDF failed: ${errorMsg}`);
      setStatus(`Error: ${errorMsg}`);
    }
  };

  const testMultipleOrders = async () => {
    addLog("Testing multiple orders PDF download...");
    setStatus("Testing multiple orders...");
    try {
      await downloadOrdersPdf(mockOrders);
      addLog("✓ Multiple orders PDF download triggered");
      setStatus("Success! Check your downloads or browser console.");
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : "Unknown error";
      addLog(`✗ Multiple orders PDF failed: ${errorMsg}`);
      setStatus(`Error: ${errorMsg}`);
    }
  };

  const testBlobCreation = () => {
    addLog("Testing Blob creation...");
    setStatus("Testing Blob...");
    try {
      const testBlob = new Blob(["Test PDF content"], { type: "application/pdf" });
      addLog(`✓ Blob created: size=${testBlob.size} bytes, type=${testBlob.type}`);
      const url = URL.createObjectURL(testBlob);
      addLog(`✓ Blob URL created: ${url.substring(0, 50)}...`);
      URL.revokeObjectURL(url);
      addLog("✓ Blob URL revoked");
      setStatus("Blob test passed!");
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : "Unknown error";
      addLog(`✗ Blob test failed: ${errorMsg}`);
      setStatus(`Error: ${errorMsg}`);
    }
  };

  const clearLogs = () => {
    setLogs([]);
    setStatus("");
  };

  return (
    <div className="container mx-auto max-w-4xl p-4">
      <h1 className="mb-6 text-2xl font-bold">PDF Download Test Page</h1>

      <div className="mb-6 space-y-4 rounded-lg border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
        <h2 className="text-lg font-semibold">Test Actions</h2>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={testSingleOrder}
            className="rounded-lg bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
          >
            Test Single Order PDF
          </button>
          <button
            onClick={testMultipleOrders}
            className="rounded-lg bg-green-500 px-4 py-2 text-white hover:bg-green-600"
          >
            Test Multiple Orders PDF
          </button>
          <button
            onClick={testBlobCreation}
            className="rounded-lg bg-purple-500 px-4 py-2 text-white hover:bg-purple-600"
          >
            Test Blob Creation
          </button>
          <button
            onClick={clearLogs}
            className="rounded-lg bg-gray-500 px-4 py-2 text-white hover:bg-gray-600"
          >
            Clear Logs
          </button>
        </div>
        {status && (
          <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800 dark:bg-blue-900/30 dark:text-blue-200">
            {status}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
        <h2 className="mb-2 text-lg font-semibold">Debug Logs</h2>
        <div className="max-h-96 overflow-y-auto rounded bg-gray-900 p-3 font-mono text-xs text-green-400">
          {logs.length === 0 ? (
            <div className="text-gray-500">No logs yet. Click a test button above.</div>
          ) : (
            logs.map((log, i) => (
              <div key={i} className="mb-1">
                {log}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-800 dark:bg-yellow-900/20">
        <h3 className="mb-2 font-semibold text-yellow-800 dark:text-yellow-200">How to Use</h3>
        <ol className="list-inside list-decimal space-y-1 text-sm text-yellow-700 dark:text-yellow-300">
          <li>Open browser DevTools (F12) and go to the Console tab</li>
          <li>Click the test buttons above</li>
          <li>Watch the logs here and in the browser console</li>
          <li>Check if PDF downloads appear in your Downloads folder</li>
          <li>If downloads don&apos;t appear, check browser console for errors</li>
        </ol>
      </div>
    </div>
  );
}
