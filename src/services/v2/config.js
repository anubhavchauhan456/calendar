import dotenv from 'dotenv';

dotenv.config();

const urlConst = {
  dev: {
    CNC_BASE_URL: 'https://cncapi-dev.zillit.com/api',
  },
  qa: {
    CNC_BASE_URL: 'https://cncapi-qa.zillit.com/api',
  },
  prod: {
    CNC_BASE_URL: 'https://cncapi.zillit.com/api',
  },
  preprod: {
    CNC_BASE_URL: 'https://cncapi-preprod.zillit.com/api',
  },
};
const getUrls = (type) => urlConst[process.env.NODE_ENV][type];

export { getUrls };
