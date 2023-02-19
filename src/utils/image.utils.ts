export const imagePathToUri = (photoPath: string) => {
  // `file://${photoPath}` is the format that is required by the Image component
  return `file://${photoPath}`;
};
