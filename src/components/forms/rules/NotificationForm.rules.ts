export const rules = {
  range: {
    required: true,
    min: 1,
    max: 1000,
    pattern: /^\d+$/,
  },
  name: {
    required: true,
    minLength: 3,
    maxLength: 50,
  },
  timeInMinutes: {
    required: true,
    min: 0,
    max: 1440,
    // pattern to allow only numbers
    pattern: /^\d+$/,
  },
  trend: {
    required: true,
  },
};
