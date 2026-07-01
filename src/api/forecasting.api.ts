import client from './client';

export const forecastingApi = {
  getDemandForecast: (productId: string) =>
    client.get(`/forecasting/demand?productId=${productId}`),

  getEoqSchedule: (productId: string) =>
    client.get(`/forecasting/eoq?productId=${productId}`),

  getDeadStock: () =>
    client.get('/forecasting/dead-stock'),

  getDeadStockSummary: () =>
    client.get('/forecasting/dead-stock/summary'),

  getSeasonality: () =>
    client.get('/forecasting/seasonality'),

  getModelAccuracy: () =>
    client.get('/forecasting/model-accuracy'),

  refreshForecasts: () =>
    client.post('/forecasting/refresh'),
};
