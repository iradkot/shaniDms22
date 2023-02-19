export const rules = {
  name: {
    required: true,
    minLength: 3,
    maxLength: 50,
  },
  carbs: {
    required: true,
    min: 0,
    pattern: /^\d+$/,
  },
  notes: {
    maxLength: 200,
  },
};
