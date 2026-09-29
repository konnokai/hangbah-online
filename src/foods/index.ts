import type { Component } from "vue";
import BloodCake from "./BloodCake.vue";
import Corn from "./Corn.vue";
import Meat from "./Meat.vue";
import Mushroom from "./Mushroom.vue";
import Pepper from "./Pepper.vue";
import Sausage from "./Sausage.vue";
import Tempura from "./Tempura.vue";
import Toast from "./Toast.vue";
import Wing from "./Wing.vue";

export const FOOD_ART: Record<string, Component> = {
	meat: Meat,
	sausage: Sausage,
	corn: Corn,
	tempura: Tempura,
	mushroom: Mushroom,
	pepper: Pepper,
	bloodcake: BloodCake,
	wing: Wing,
	toast: Toast,
};

// 要跟各元件的 viewBox 寬高比一致，外層才能用 aspect-ratio 算出不留白的框
export const FOOD_ASPECT: Record<string, number> = {
	meat: 100 / 72,
	sausage: 100 / 34,
	corn: 100 / 40,
	tempura: 100 / 56,
	mushroom: 1,
	pepper: 100 / 98,
	bloodcake: 100 / 44,
	wing: 100 / 56,
	toast: 100 / 97,
};
