// Seed instrument universe. Index membership changes periodically: verify against the latest
// NSE index factsheets and update via the admin panel / instruments table before going live.
// Lot sizes for stock/index F&O are revised by NSE often, so they are taken from the provider,
// not hard-coded here. MCX and currency lot sizes below are standard contract specifications;
// confirm against the exchange contract specs your provider returns.

export const INDICES = [
  { symbol: 'NIFTY 50', name: 'NIFTY 50', key: 'NIFTY' },
  { symbol: 'NIFTY BANK', name: 'BANK NIFTY', key: 'BANKNIFTY' },
  { symbol: 'NIFTY IT', name: 'NIFTY IT' },
  { symbol: 'NIFTY AUTO', name: 'NIFTY AUTO' },
  { symbol: 'NIFTY PHARMA', name: 'NIFTY PHARMA' },
  { symbol: 'NIFTY FMCG', name: 'NIFTY FMCG' },
  { symbol: 'NIFTY METAL', name: 'NIFTY METAL' },
  { symbol: 'NIFTY FIN SERVICE', name: 'NIFTY FINANCIAL SERVICES' },
  { symbol: 'INDIA VIX', name: 'INDIA VIX' },
];

// [symbol, company, sector, inNifty50, inBankNifty]
export const EQUITIES = [
  ['RELIANCE', 'Reliance Industries', 'Energy', 1, 0], ['HDFCBANK', 'HDFC Bank', 'Banking', 1, 1],
  ['ICICIBANK', 'ICICI Bank', 'Banking', 1, 1], ['INFY', 'Infosys', 'IT', 1, 0],
  ['TCS', 'Tata Consultancy Services', 'IT', 1, 0], ['BHARTIARTL', 'Bharti Airtel', 'Telecom', 1, 0],
  ['ITC', 'ITC', 'FMCG', 1, 0], ['SBIN', 'State Bank of India', 'Banking', 1, 1],
  ['LT', 'Larsen & Toubro', 'Infrastructure', 1, 0], ['AXISBANK', 'Axis Bank', 'Banking', 1, 1],
  ['KOTAKBANK', 'Kotak Mahindra Bank', 'Banking', 1, 1], ['HINDUNILVR', 'Hindustan Unilever', 'FMCG', 1, 0],
  ['BAJFINANCE', 'Bajaj Finance', 'Financial Services', 1, 0], ['MARUTI', 'Maruti Suzuki', 'Auto', 1, 0],
  ['M&M', 'Mahindra & Mahindra', 'Auto', 1, 0], ['SUNPHARMA', 'Sun Pharmaceutical', 'Pharma', 1, 0],
  ['HCLTECH', 'HCL Technologies', 'IT', 1, 0], ['TATAMOTORS', 'Tata Motors', 'Auto', 1, 0],
  ['NTPC', 'NTPC', 'Power', 1, 0], ['TITAN', 'Titan Company', 'Consumer', 1, 0],
  ['ULTRACEMCO', 'UltraTech Cement', 'Cement', 1, 0], ['POWERGRID', 'Power Grid Corporation', 'Power', 1, 0],
  ['ASIANPAINT', 'Asian Paints', 'Consumer', 1, 0], ['TATASTEEL', 'Tata Steel', 'Metal', 1, 0],
  ['WIPRO', 'Wipro', 'IT', 1, 0], ['ONGC', 'Oil & Natural Gas Corporation', 'Energy', 1, 0],
  ['ADANIPORTS', 'Adani Ports & SEZ', 'Infrastructure', 1, 0], ['COALINDIA', 'Coal India', 'Mining', 1, 0],
  ['BAJAJFINSV', 'Bajaj Finserv', 'Financial Services', 1, 0], ['NESTLEIND', 'Nestle India', 'FMCG', 1, 0],
  ['JSWSTEEL', 'JSW Steel', 'Metal', 1, 0], ['HINDALCO', 'Hindalco Industries', 'Metal', 1, 0],
  ['GRASIM', 'Grasim Industries', 'Cement', 1, 0], ['TECHM', 'Tech Mahindra', 'IT', 1, 0],
  ['INDUSINDBK', 'IndusInd Bank', 'Banking', 1, 1], ['CIPLA', 'Cipla', 'Pharma', 1, 0],
  ['DRREDDY', "Dr. Reddy's Laboratories", 'Pharma', 1, 0], ['EICHERMOT', 'Eicher Motors', 'Auto', 1, 0],
  ['HEROMOTOCO', 'Hero MotoCorp', 'Auto', 1, 0], ['BRITANNIA', 'Britannia Industries', 'FMCG', 1, 0],
  ['APOLLOHOSP', 'Apollo Hospitals', 'Healthcare', 1, 0], ['TATACONSUM', 'Tata Consumer Products', 'FMCG', 1, 0],
  ['SBILIFE', 'SBI Life Insurance', 'Insurance', 1, 0], ['HDFCLIFE', 'HDFC Life Insurance', 'Insurance', 1, 0],
  ['BAJAJ-AUTO', 'Bajaj Auto', 'Auto', 1, 0], ['ADANIENT', 'Adani Enterprises', 'Diversified', 1, 0],
  ['SHRIRAMFIN', 'Shriram Finance', 'Financial Services', 1, 0], ['TRENT', 'Trent', 'Retail', 1, 0],
  ['BEL', 'Bharat Electronics', 'Defence', 1, 0], ['ETERNAL', 'Eternal (Zomato)', 'Consumer Tech', 1, 0],
  ['BANKBARODA', 'Bank of Baroda', 'Banking', 0, 1], ['PNB', 'Punjab National Bank', 'Banking', 0, 1],
  ['FEDERALBNK', 'Federal Bank', 'Banking', 0, 1], ['IDFCFIRSTB', 'IDFC First Bank', 'Banking', 0, 1],
  ['AUBANK', 'AU Small Finance Bank', 'Banking', 0, 1], ['CANBK', 'Canara Bank', 'Banking', 0, 1],
];

export const FNO_UNDERLYINGS = ['NIFTY', 'BANKNIFTY', 'RELIANCE', 'HDFCBANK', 'ICICIBANK', 'INFY', 'TCS', 'SBIN'];

// [symbol, name, unit, lotDescription, lotSize, tickSize]
export const COMMODITIES = [
  ['GOLD', 'Gold', '₹/10 g', '1 kg', 1, 1],
  ['SILVER', 'Silver', '₹/kg', '30 kg', 30, 1],
  ['CRUDEOIL', 'Crude Oil', '₹/barrel', '100 barrels', 100, 1],
  ['NATURALGAS', 'Natural Gas', '₹/mmBtu', '1,250 mmBtu', 1250, 0.1],
  ['COPPER', 'Copper', '₹/kg', '2,500 kg', 2500, 0.05],
  ['ZINC', 'Zinc', '₹/kg', '5,000 kg', 5000, 0.05],
  ['ALUMINIUM', 'Aluminium', '₹/kg', '5,000 kg', 5000, 0.05],
];

// [symbol, name, lotSize (base currency units), tickSize]
export const CURRENCIES = [
  ['USDINR', 'US Dollar / Indian Rupee', 1000, 0.0025],
  ['EURINR', 'Euro / Indian Rupee', 1000, 0.0025],
  ['GBPINR', 'British Pound / Indian Rupee', 1000, 0.0025],
  ['JPYINR', 'Japanese Yen (100) / Indian Rupee', 100000, 0.0025],
];
