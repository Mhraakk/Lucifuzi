// View models of the management dashboard (JSDoc types: the project is plain ES modules without a build step, so
// the shapes are declared here and checked by the adapters and tests instead of a TypeScript compiler).
// Money is integer rial (displayed in the shop's chosen unit), gold is grams of 750.

/**
 * @typedef {'today'|'7'|'30'|'90'|'custom'} RangeKey
 *
 * @typedef {Object} GoldPositionPoint
 * @property {string} timestamp        ISO day, or 'HH' for an hour of today
 * @property {string} label            Persian axis label
 * @property {number} physicalGold     grams in the melt box and sealed bars
 * @property {number} goldReceivables  grams customers owe the shop
 * @property {number} goldLiabilities  grams the shop owes customers (custody, bars held for them)
 * @property {number} netGoldPosition  physical + receivables − liabilities
 *
 * @typedef {Object} KpiCard
 * @property {'physical'|'receivables'|'liabilities'|'net'} key
 * @property {string} title
 * @property {string} value            formatted main number
 * @property {string} unit
 * @property {string} sub              second line (market value, counts)
 * @property {number} change           % against 7 days ago
 * @property {boolean} goodWhenUp      colour of the change
 * @property {number[]} spark          30 daily values
 * @property {string} href             drill-down route
 *
 * @typedef {Object} AgingBucket
 * @property {string} key
 * @property {string} label
 * @property {number} amount           rial
 * @property {number} pct              share of all receivables
 * @property {number} customers
 * @property {number} avgDays          amount-weighted age
 * @property {{id:string,label:string,amount:number,days:number}[]} parties
 *
 * @typedef {Object} AllocationSegment
 * @property {'gold'|'coin'|'cash'|'recv'|'other'} key
 * @property {string} label
 * @property {number} value            rial
 * @property {number} pct
 * @property {string} color            CSS colour token
 *
 * @typedef {Object} RecentTrade
 * @property {string} id
 * @property {string} track            tracking code
 * @property {string} time
 * @property {string} kind             «خرید آبشده» …
 * @property {string} qty
 * @property {string} unitPrice
 * @property {number} amount           rial (0 when only goods moved)
 * @property {'settled'|'open'|'void'|'goods'} status
 *
 * @typedef {Object} CashFlow
 * @property {number} in
 * @property {number} out
 * @property {number} net
 * @property {{h:number,in:number,out:number}[]} byHour
 *
 * @typedef {Object} InventoryRow
 * @property {string} key
 * @property {string} label
 * @property {string} qty
 * @property {number|null} value       rial at today's price
 * @property {string} icon
 * @property {string} href
 *
 * @typedef {Object} DashboardView
 * @property {string} day
 * @property {RangeKey} range
 * @property {{mazaneh:number|null, p750:number, pct:number|null, spark:number[], sample:boolean, at:string}} price
 * @property {KpiCard[]} kpis
 * @property {{points: GoldPositionPoint[], mode:'day'|'hour', p750:number}} position
 * @property {{total:number, buckets: AgingBucket[]}} aging
 * @property {{market: AllocationSegment[], book: AllocationSegment[], bookPartial:boolean, physical:{key:string,label:string,grams:number,value:number,inside?:boolean,count?:number}[]}} allocation
 * @property {RecentTrade[]} recent
 * @property {CashFlow} cash
 * @property {InventoryRow[]} inventory
 * @property {{high:number, mid:number, score?:number}} alerts
 */
export {};
