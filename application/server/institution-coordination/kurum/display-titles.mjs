/**
 * Konu -> kuruma gosterilecek guvenli baslik.
 *
 * Kural: serbest metin ASLA kopyalanmaz. Yalnizca kategori duzeyinde, kisi ve
 * ayrinti icermeyen bir baslik uretilir. `route-event.mjs` icindeki eski liste
 * 50 konudan yalnizca 10'unu biliyordu; kalan 40 konu
 * "topic_has_no_safe_projection_title" ile bloklaniyordu. Bu dosya tamamidir.
 */
export const displayTitles = Object.freeze({
  // --- su / altyapi
  water_leak: 'Su kaçağı bildirimi',
  water_outage: 'Su kesintisi bildirimi',
  sewer_overflow: 'Atık su altyapısı bildirimi',
  water_infrastructure: 'Su altyapısı bildirimi',

  // --- enerji
  power_outage: 'Elektrik kesintisi bildirimi',
  fallen_power_equipment: 'Elektrik donanımı bildirimi',
  electrical_hazard: 'Elektrik güvenliği bildirimi',

  // --- gaz
  gas_outage: 'Doğal gaz kesintisi bildirimi',
  gas_leak_public_hazard: 'Doğal gaz güvenliği bildirimi',

  // --- iletişim
  telecom_outage: 'İletişim hizmeti kesintisi bildirimi',
  telecom_infrastructure: 'İletişim altyapısı bildirimi',

  // --- acil durum
  fire_rescue: 'Yangın müdahale bildirimi',
  hazardous_material_response: 'Tehlikeli madde bildirimi',
  flooding: 'Su baskını bildirimi',
  storm_damage: 'Fırtına hasarı bildirimi',
  district_emergency_coordination: 'İlçe acil durum koordinasyon bildirimi',
  multi_agency_incident: 'Çok kurumlu olay bildirimi',

  // --- guvenlik
  traffic_safety: 'Trafik güvenliği bildirimi',
  public_safety: 'Kamu güvenliği bildirimi',

  // --- egitim
  school_facility: 'Okul binası bakım bildirimi',
  school_perimeter_safety: 'Okul çevresi güvenliği bildirimi',
  education_service_access: 'Eğitim hizmeti erişimi bildirimi',

  // --- saglik
  public_health_facility: 'Sağlık tesisi bildirimi',
  health_service_access: 'Sağlık hizmeti erişimi bildirimi',

  // --- belediye hizmetleri
  waste_container: 'Atık konteyneri bildirimi',
  street_cleanliness: 'Temizlik hizmeti bildirimi',
  municipal_roadside_asset: 'Yol ve kaldırım bildirimi',
  parks_public_space: 'Park ve ortak alan bildirimi',
  municipal_service_access: 'Belediye hizmeti erişimi bildirimi',

  // --- buyuksehir
  ibb_road_maintenance: 'Büyükşehir yol bakım bildirimi',
  drainage_public_space: 'Yağmur suyu drenajı bildirimi',
  metropolitan_service_access: 'Büyükşehir hizmeti erişimi bildirimi',
  metropolitan_waste_collection: 'Büyükşehir atık toplama bildirimi',
  illegal_dumping_public_space: 'Kaçak döküm bildirimi',

  // --- toplu tasima
  bus_service_disruption: 'Otobüs seferi aksaması bildirimi',
  bus_stop_infrastructure: 'Toplu taşıma durağı bildirimi',
  public_transport_safety: 'Toplu taşıma güvenliği bildirimi',
  metro_service_disruption: 'Metro seferi aksaması bildirimi',
  metro_station_infrastructure: 'Metro istasyonu bildirimi',

  // --- kamu kurumlari
  civil_registry_service_access: 'Nüfus hizmeti erişimi bildirimi',
  land_registry_service_access: 'Tapu hizmeti erişimi bildirimi',
  social_security_service_access: 'Sosyal güvenlik hizmeti erişimi bildirimi',
  employment_service_access: 'İstihdam hizmeti erişimi bildirimi',
  social_assistance_service_access: 'Sosyal yardım hizmeti erişimi bildirimi',
  social_service_access: 'Sosyal hizmet erişimi bildirimi',

  // --- hayvan / tarim
  animal_health_public_agriculture: 'Hayvan sağlığı ve tarım bildirimi',
  urban_animal_welfare: 'Sokak hayvanı refahı bildirimi',

  // --- yonetim
  public_service_access: 'Kamu hizmeti erişimi bildirimi',
  district_coordination: 'İlçe koordinasyon bildirimi',
  neighborhood_service_observation: 'Mahalle hizmeti gözlem bildirimi',
});

export function baslikVar(konu) {
  return Object.prototype.hasOwnProperty.call(displayTitles, konu);
}
