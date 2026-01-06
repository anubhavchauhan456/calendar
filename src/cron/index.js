// eslint-disable-next-line import/no-extraneous-dependencies
import cron from 'node-cron';
import event from './get-reminder';

const init = async () => {
  /* Executed every 1 minute */
  cron.schedule('*/1 * * * *', async () => {
    console.log(`CRON/fetchEvents PROJECT:FREQUENCY 1 MIN: ${Date.now()}`);
    await event();
  });
};

export default { init };
