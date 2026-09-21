import test from 'node:test';
import assert from 'node:assert/strict';
import {extractOrder,fullDate} from '../lib/extract-order.mjs';
import {extractCodes} from '../components/scanner/upc.mjs';
test('administrative labels are extracted without treating frame item numbers or phones as order IDs',()=>{
 const {order,warnings}=extractOrder('Eyeglass Lab Order\nCustomer: Test Person   Phone: (555) 010-1234\nItem Number: A2056157\nOrder #: TEST-100\nOrder Date: 9/21/2026\nExpected: 10/2/2026\nLab Make: Example Lab\nUPC Code: 012345678905');
 assert.equal(order.patient,'Test Person');assert.equal(order.reference,'TEST-100');assert.equal(order.upc,'012345678905');assert.equal(order.lab,'Example Lab');assert.equal(order.orderedOn,'2026-09-21');assert.equal(order.dueOn,'2026-10-02');assert.equal(warnings.length,0);
 assert.equal(extractOrder('Item Number: A2056157\nPhone #1: 5550101234').order.reference,'');
});
test('partial and invalid dates require review, never an invented year',()=>{
 assert.equal(fullDate('9/21'),'');assert.equal(fullDate('02/29/2025'),'');assert.equal(fullDate('02/29/2024'),'2024-02-29');
 const result=extractOrder('Patient: Example\nExpected: 9/21');assert.equal(result.order.dueOn,'');assert.ok(result.warnings.some(w=>w.includes('complete year')));
});
test('unlabelled or conflicting numbers are not selected as frame UPC',()=>{
 assert.equal(extractOrder('012345678905').order.upc,'');
 assert.equal(extractOrder('UPC Code: 012345678906').order.upc,'');
 assert.equal(extractOrder('UPC: 012345678905\nUPC: 036000291452').order.upc,'');
 assert.equal(extractCodes('UPC: O12345678905')[0].trusted,false);
});
