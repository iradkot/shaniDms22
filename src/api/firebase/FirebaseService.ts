import {AuthService} from './services/AuthService';
import {FoodService} from './services/FoodService';
import {SportService} from './services/SportService';
import {UserService} from './services/UserService';
import {StorageService} from './services/StorageService';
import {BgSample} from 'app/types/day_bgs.types';
import {FoodItemDTO} from 'app/types/food.types';
import {SportItemDTO} from 'app/types/sport.types';

export class FirebaseService {
  private authService: AuthService;
  private foodService: FoodService;
  private sportService: SportService;
  private userService: UserService;
  private storageService: StorageService;

  constructor() {
    this.authService = new AuthService();
    this.foodService = new FoodService();
    this.sportService = new SportService();
    this.userService = new UserService();
    this.storageService = new StorageService();
  }

  // UserTypes methods
  async getCurrentUserFSData() {
    try {
      return await this.userService.getCurrentUserFSData();
    } catch (error) {
      console.error('Error getting current user FS data', error);
      throw new Error('Failed to fetch current user data');
    }
  }

  createUserFSData(userId: string, phoneToken: string, email?: string) {
    try {
      this.userService.createUserFSData(userId, phoneToken, email);
    } catch (error) {
      console.error('Error creating user FS data', error);
      throw new Error('Failed to create user data');
    }
  }

  // Food methods
  async getFoodItemsForSingleDay(date: Date): Promise<FoodItemDTO[]> {
    try {
      return await this.foodService.getFoodItemsForSingleDay(date);
    } catch (error) {
      console.error('Error fetching food items for single day', error);
      throw new Error('Failed to fetch food items for the specified day');
    }
  }

  async getFoodItemsByDateRange(
    startDate: Date,
    endDate: Date,
  ): Promise<FoodItemDTO[]> {
    try {
      return await this.foodService.getFoodItemsByDateRange(startDate, endDate);
    } catch (error) {
      console.error('Error fetching food items by date range', error);
      throw new Error(
        'Failed to fetch food items for the specified date range',
      );
    }
  }

  async getFoodItemBgData(foodItem: FoodItemDTO): Promise<BgSample[]> {
    try {
      return await this.foodService.getFoodItemBgData(foodItem);
    } catch (error) {
      console.error('Error fetching BG data for food item', error);
      throw new Error('Failed to fetch BG data for the specified food item');
    }
  }

  // Sport methods
  async getSportItems(
    startDate?: Date,
    endDate?: Date,
  ): Promise<SportItemDTO[]> {
    try {
      return await this.sportService.getSportItems(startDate, endDate);
    } catch (error) {
      console.error('Error fetching sport items', error);
      throw new Error(
        'Failed to fetch sport items for the specified date range',
      );
    }
  }

  // Storage methods
  async getFoodItemImage(imageName: string): Promise<string> {
    try {
      console.log('getting image - ', imageName);
      return await this.storageService.getFoodItemImage(imageName);
    } catch (error) {
      console.error('Error fetching food item image', error);
      throw new Error('Failed to fetch image for the specified food item');
    }
  }
}

export default new FirebaseService();
