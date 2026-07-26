import { generatePDF } from 'react-native-html-to-pdf';
import RNShare from 'react-native-share';
import { Alert, Platform, NativeModules } from 'react-native';
import { Organization } from '../db/types';
import { InvoiceWithCustomerName, getInvoiceItems } from '../db/operations';

export type PdfReportType = 'summary' | 'detailed';

export const generateInvoicesPdfReport = async (
  organization: Organization,
  invoices: InvoiceWithCustomerName[],
  filterTitle: string = 'Invoices Sales Report',
  reportType: PdfReportType = 'summary'
): Promise<string> => {
  const dateStr = new Date().toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const totalInvoices = invoices.length;
  const totalAmount = invoices.reduce((sum, inv) => sum + inv.grandTotal, 0);
  const paidInvoices = invoices.filter((i) => i.paymentStatus === 'Paid');
  const unpaidInvoices = invoices.filter((i) => i.paymentStatus === 'Unpaid');
  const paidAmount = paidInvoices.reduce((sum, inv) => sum + inv.grandTotal, 0);
  const unpaidAmount = unpaidInvoices.reduce((sum, inv) => sum + inv.grandTotal, 0);

  let contentHtml = '';

  if (reportType === 'detailed') {
    const detailedBlocks = await Promise.all(
      invoices.map(async (inv) => {
        const items = await getInvoiceItems(inv.id);
        const itemRows = items
          .map(
            (item) => `
            <tr style="background-color: #ffffff;">
              <td style="padding: 8px 10px; border-bottom: 1px solid #eeeeee; font-size: 12px; font-weight: 500;">${item.name}</td>
              <td style="padding: 8px 10px; border-bottom: 1px solid #eeeeee; font-size: 12px;">${item.quantity} ${item.unit || 'Pcs'}</td>
              <td style="padding: 8px 10px; border-bottom: 1px solid #eeeeee; font-size: 12px;">${organization.currency || 'Rs.'}${item.price.toFixed(2)}</td>
              <td style="padding: 8px 10px; border-bottom: 1px solid #eeeeee; font-size: 12px;">${item.taxRate || 0}%</td>
              <td style="padding: 8px 10px; border-bottom: 1px solid #eeeeee; font-size: 12px; text-align: right; font-weight: bold; color: #111;">${organization.currency || 'Rs.'}${(item.price * item.quantity).toFixed(2)}</td>
            </tr>
          `
          )
          .join('');

        return `
          <div style="margin-bottom: 16px; border: 1px solid #d0d7de; border-radius: 8px; overflow: hidden; page-break-inside: avoid;">
            <div style="background-color: #f0f4f8; padding: 10px 14px; border-bottom: 1px solid #d0d7de;">
              <table style="width: 100%; border-collapse: collapse; margin: 0; background: transparent;">
                <tr>
                  <td style="padding: 0; border: none;">
                    <span style="font-weight: bold; font-size: 14px; color: #1976D2;">${inv.invoiceNumber}</span>
                    <span style="font-size: 12px; color: #555555; margin-left: 10px;">${new Date(inv.date).toLocaleDateString()}</span>
                    <span style="font-size: 12px; color: #333333; margin-left: 10px; font-weight: bold;">Cust: ${inv.customerName || 'Walk-in Customer'}</span>
                  </td>
                  <td style="padding: 0; border: none; text-align: right;">
                    <span style="font-size: 11px; font-weight: bold; padding: 3px 8px; border-radius: 4px; color: #ffffff; background-color: ${inv.paymentStatus === 'Paid' ? '#2E7D32' : '#C62828'};">
                      ${inv.paymentStatus.toUpperCase()}
                    </span>
                    <span style="font-size: 14px; font-weight: bold; color: #111111; margin-left: 10px;">
                      ${organization.currency || 'Rs.'}${inv.grandTotal.toFixed(2)}
                    </span>
                  </td>
                </tr>
              </table>
            </div>
            <table style="width: 100%; border-collapse: collapse; margin: 0;">
              <thead>
                <tr style="background-color: #fafafa;">
                  <th style="padding: 8px 10px; border-bottom: 1px solid #e0e0e0; font-size: 11px; text-align: left; color: #555555;">Product Item</th>
                  <th style="padding: 8px 10px; border-bottom: 1px solid #e0e0e0; font-size: 11px; text-align: left; color: #555555;">Qty / Unit</th>
                  <th style="padding: 8px 10px; border-bottom: 1px solid #e0e0e0; font-size: 11px; text-align: left; color: #555555;">Unit Rate</th>
                  <th style="padding: 8px 10px; border-bottom: 1px solid #e0e0e0; font-size: 11px; text-align: left; color: #555555;">GST %</th>
                  <th style="padding: 8px 10px; border-bottom: 1px solid #e0e0e0; font-size: 11px; text-align: right; color: #555555;">Total</th>
                </tr>
              </thead>
              <tbody>
                ${itemRows || '<tr><td colspan="5" style="padding: 10px; text-align: center; color: #999;">No items listed</td></tr>'}
              </tbody>
            </table>
          </div>
        `;
      })
    );
    contentHtml = detailedBlocks.join('');
  } else {
    // Summary table layout
    const tableRowsHtml = invoices
      .map(
        (inv, idx) => `
        <tr style="background-color: ${idx % 2 === 0 ? '#ffffff' : '#f8f9fa'};">
          <td style="padding: 10px 12px; border-bottom: 1px solid #e0e0e0; font-weight: bold; color: #1a1a1a;">${inv.invoiceNumber}</td>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e0e0e0; color: #555555;">${new Date(inv.date).toLocaleDateString()}</td>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e0e0e0; color: #333333;">${inv.customerName || 'Walk-in Customer'}</td>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e0e0e0; font-weight: bold; color: ${inv.paymentStatus === 'Paid' ? '#2E7D32' : '#C62828'};">
            ${inv.paymentStatus.toUpperCase()}
          </td>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e0e0e0; text-align: right; font-weight: bold; color: #111111;">
            ${organization.currency || 'Rs.'} ${inv.grandTotal.toFixed(2)}
          </td>
        </tr>
      `
      )
      .join('');

    contentHtml = `
      <table class="data-table">
        <thead>
          <tr>
            <th>Bill #</th>
            <th>Date</th>
            <th>Customer</th>
            <th>Status</th>
            <th class="right">Grand Total</th>
          </tr>
        </thead>
        <tbody>
          ${tableRowsHtml}
        </tbody>
      </table>
    `;
  }

  const reportSubtitle = reportType === 'detailed' ? `${filterTitle} (Detailed Products Breakdown)` : filterTitle;

  const htmlDocument = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            margin: 24px;
            color: #222222;
          }
          .header {
            text-align: center;
            border-bottom: 3px solid #1976D2;
            padding-bottom: 16px;
            margin-bottom: 20px;
          }
          .store-name {
            font-size: 26px;
            font-weight: bold;
            color: #1976D2;
            margin: 0;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .store-detail {
            font-size: 13px;
            color: #555555;
            margin-top: 4px;
          }
          .report-title {
            font-size: 18px;
            font-weight: bold;
            margin-top: 14px;
            color: #222222;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .summary-table {
            width: 100%;
            margin-bottom: 24px;
            background-color: #f0f4f8;
            border-radius: 8px;
            padding: 12px;
            border-collapse: separate;
            border-spacing: 12px 4px;
          }
          .summary-box {
            text-align: center;
            background: #ffffff;
            padding: 12px;
            border-radius: 6px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.05);
          }
          .summary-label {
            font-size: 11px;
            color: #666666;
            text-transform: uppercase;
            font-weight: bold;
            letter-spacing: 0.5px;
          }
          .summary-val {
            font-size: 18px;
            font-weight: bold;
            margin-top: 4px;
          }
          table.data-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
            font-size: 13px;
          }
          table.data-table th {
            background-color: #1976D2;
            color: #ffffff;
            padding: 12px;
            text-align: left;
            font-weight: bold;
            text-transform: uppercase;
            font-size: 11px;
            letter-spacing: 0.5px;
          }
          table.data-table th.right {
            text-align: right;
          }
          .footer {
            margin-top: 36px;
            text-align: center;
            font-size: 11px;
            color: #888888;
            border-top: 1px solid #e0e0e0;
            padding-top: 12px;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1 class="store-name">${organization.name || 'PARCHIWALA STORE'}</h1>
          <div class="store-detail">${organization.address || ''}</div>
          <div class="store-detail">
            ${organization.phone ? 'Ph: ' + organization.phone : ''} 
            ${organization.gstNumber ? ' &bull; GSTIN: ' + organization.gstNumber : ''}
          </div>
          <div class="report-title">${reportSubtitle}</div>
          <div style="font-size: 11px; color: #777777; margin-top: 4px;">Generated on ${dateStr}</div>
        </div>

        <table class="summary-table">
          <tr>
            <td class="summary-box" style="width: 25%;">
              <div class="summary-label">Total Invoices</div>
              <div class="summary-val" style="color: #222222;">${totalInvoices}</div>
            </td>
            <td class="summary-box" style="width: 25%;">
              <div class="summary-label">Total Sales</div>
              <div class="summary-val" style="color: #1976D2;">${organization.currency || 'Rs.'} ${totalAmount.toFixed(2)}</div>
            </td>
            <td class="summary-box" style="width: 25%;">
              <div class="summary-label">Paid (${paidInvoices.length})</div>
              <div class="summary-val" style="color: #2E7D32;">${organization.currency || 'Rs.'} ${paidAmount.toFixed(2)}</div>
            </td>
            <td class="summary-box" style="width: 25%;">
              <div class="summary-label">Unpaid (${unpaidInvoices.length})</div>
              <div class="summary-val" style="color: #C62828;">${organization.currency || 'Rs.'} ${unpaidAmount.toFixed(2)}</div>
            </td>
          </tr>
        </table>

        ${contentHtml}

        <div class="footer">
          Generated via Parchiwala POS Billing App &bull; Total ${totalInvoices} Record(s) Included
        </div>
      </body>
    </html>
  `;

  const now = new Date();
  const dateTag = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  const fileName = `${reportType === 'detailed' ? 'Detailed_Sales_Report' : 'Summary_Sales_Report'}_${dateTag}`;

  try {
    const options = {
      html: htmlDocument,
      fileName: fileName,
      base64: true,
    };

    const file = await generatePDF(options);

    let finalPath = file.filePath || '';

    if (!finalPath && file.base64 && NativeModules.RNFSManager) {
      const RNFS = require('react-native-fs');
      finalPath = `${RNFS.DocumentDirectoryPath}/${fileName}.pdf`;
      await RNFS.writeFile(finalPath, file.base64, 'base64');
    }

    return finalPath;
  } catch (err: any) {
    console.error('[PdfReportService] PDF Generation failed:', err);
    throw err;
  }
};

export const shareInvoicesPdfReport = async (
  organization: Organization,
  invoices: InvoiceWithCustomerName[],
  filterTitle: string = 'Invoices Sales Report',
  reportType: PdfReportType = 'summary'
): Promise<void> => {
  try {
    const pdfPath = await generateInvoicesPdfReport(organization, invoices, filterTitle, reportType);
    if (!pdfPath) {
      Alert.alert('Error', 'Could not generate PDF report file.');
      return;
    }

    const fileName = `${reportType === 'detailed' ? 'Detailed_Sales_Report' : 'Summary_Sales_Report'}_${Date.now()}.pdf`;
    const shareUrl = Platform.OS === 'android' ? `file://${pdfPath}` : pdfPath;

    await RNShare.open({
      url: shareUrl,
      type: 'application/pdf',
      filename: fileName,
      title: `${reportType === 'detailed' ? 'Detailed' : 'Summary'} Sales Report PDF`,
      failOnCancel: false,
    });
  } catch (e: any) {
    if (e && e.message && !e.message.includes('User did not share') && !e.message.includes('CANCELLED')) {
      Alert.alert('Error', 'Failed to share PDF report.');
    }
  }
};
