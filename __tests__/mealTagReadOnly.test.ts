import AsyncStorage from '@react-native-async-storage/async-storage';

import {nightscoutInstance} from 'app/api/shaniNightscoutInstances';
import {
  getTagsForMeal,
  tagMealAndSync,
} from 'app/services/mealTagService';

describe('meal tags in read-only Nightscout mode', () => {
  beforeEach(async () => {
    jest.restoreAllMocks();
    await AsyncStorage.clear();
  });

  it('keeps a tag edit local without sending any Nightscout request', async () => {
    const getSpy = jest
      .spyOn(nightscoutInstance, 'get')
      .mockResolvedValue({data: {notes: ''}} as never);
    const putSpy = jest
      .spyOn(nightscoutInstance, 'put')
      .mockResolvedValue({data: {}} as never);

    await tagMealAndSync('external-carb-1', [' Pizza ', 'family dinner']);
    await Promise.resolve();

    await expect(getTagsForMeal('external-carb-1')).resolves.toEqual([
      'pizza',
      'family dinner',
    ]);
    expect(getSpy).not.toHaveBeenCalled();
    expect(putSpy).not.toHaveBeenCalled();
  });
});
