const {readdirSync, readFileSync} = require('fs');
const path = require('path');

const SOURCE_ROOTS = ['src/modules', 'src/product'];
const SOURCE_EXTENSION = /\.tsx?$/;
const FIREBASE_IMPORT =
  /(?:from\s+|require\()(['"])(?:@react-native-firebase|firebase\/)/;

function sourceFiles(directory) {
  return readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(entryPath);
    }
    return SOURCE_EXTENSION.test(entry.name) ? [entryPath] : [];
  });
}

describe('Product architecture boundaries', () => {
  it('keeps Firebase SDK imports outside the domain and product layers', () => {
    const violations = SOURCE_ROOTS.flatMap(sourceFiles).filter(filePath =>
      FIREBASE_IMPORT.test(readFileSync(filePath, 'utf8')),
    );

    expect(violations).toEqual([]);
  });
});
