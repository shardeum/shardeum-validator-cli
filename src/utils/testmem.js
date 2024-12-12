//This can be run to report the amount of memory available to the Node.js process.
//can use this to check the default mem of node
// could also run with a flag like --max-old-space-size=6144
// ex:  node --max-old-space-size=6144  src/utils/testmem.js
 
Heap size limit: 6192 MB
const v8 = require('v8');

const heapStatistics = v8.getHeapStatistics();
console.log(`Heap size limit: ${heapStatistics.heap_size_limit / 1024 / 1024} MB`);