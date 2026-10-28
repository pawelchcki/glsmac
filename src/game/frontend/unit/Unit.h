#pragma once

#include <cstddef>

#include "game/frontend/TileObject.h"

#include "game/backend/unit/Types.h"

#include "util/Timer.h"
#include "util/Scroller.h"
#include "types/Vec3.h"

namespace scene::actor { class Instanced; }

namespace types {
namespace texture {
class Texture;
}
namespace mesh {
class Render;
}
}

namespace game {
namespace frontend {

class Game;
class Slot;

namespace sprite {
class Sprite;
class InstancedSprite;
}

namespace tile {
class Tile;
}

namespace unit {

class UnitDef;
class BadgeDefs;
class SlotBadges;
class UnitManager;

class Unit : public TileObject {
public:

	static constexpr size_t MOVE_DURATION_MS = 125;

	Unit(
		UnitManager* um,
		BadgeDefs* badge_defs,
		const size_t id,
		unit::UnitDef* def,
		Slot* slot,
		tile::Tile* tile,
		const types::Vec3& render_coords,
		const bool is_owned,
		const backend::unit::movement_t movement,
		const backend::unit::morale_t morale,
		const std::string& morale_string,
		const backend::unit::health_t health,
		const backend::unit::order_t order
	);
	~Unit();

	const size_t GetId() const;
	const bool IsOwned() const;
	const bool IsActive() const;
	tile::Tile* GetTile() const;

	const size_t GetSelectionWeight() const;

	sprite::Sprite* GetSprite() const;
	sprite::Sprite* GetBadgeSprite() const;
	sprite::Sprite* GetBadgeHealthbarSprite() const;

	const std::string GetNameString() const;
	const std::string GetStatsString() const;
	const std::string& GetMoraleString() const;
	const std::string GetMovesString() const;

	void Iterate();

	void SetActiveOnTile();

	void Show();
	void Hide();

	const bool IsBadgeVisible() const;
	void ShowBadge();
	void HideBadge();

	void ShowFakeBadge( const uint8_t offset );
	void HideFakeBadge();

	void StartBadgeBlink();
	void StopBadgeBlink( const bool is_badge_shown );

	void Refresh();

	void SetMovement( const backend::unit::movement_t movement );
	void SetHealth( const backend::unit::health_t health );
	void SetOrder( backend::unit::order_t order );
	const bool CanMove() const;

	void SetTile( tile::Tile* dst_tile );
	void MoveToTile( tile::Tile* dst_tile );

	const bool IsMoving() const;

	struct meshtex_t {
		const types::mesh::Render* mesh = nullptr;
		types::texture::Texture* texture = nullptr;
	};
	struct render_data_t {
		meshtex_t unit = {};
		meshtex_t badge = {};
		meshtex_t healthbar = {};
	};
	const render_data_t& GetRenderData() const;
	// Transient native copy only; internal pointers never leave the synchronous
	// caller and are not serialized or retained as GSE wrappers/FloatPtr values.
	struct body_observation_t {
		size_t unit_id = 0;
		const SlotBadges* owner_badges = nullptr;
		std::string definition_id;
		types::Vec3 unit_coords;
		bool resource_cached = false, unit_shown = false, actor_visible = false;
		bool instance_allocated = false, instance_present = false;
		size_t instance_id = 0, instance_count = 0;
		const scene::actor::Instanced* actor = nullptr;
		std::string resource_key, resource_name, texture_filename;
		size_t atlas_x = 0, atlas_y = 0, atlas_width = 0, atlas_height = 0;
		types::Vec2< float > destination_offsets;
		types::Vec3 instance_position, instance_angle;
	};
	body_observation_t CopyBodyForObservation() const;

protected:
	void SetRenderCoords( const types::Vec3& coords ) override;

private:

	UnitManager* m_um = nullptr;

	BadgeDefs* const m_badge_defs;
	SlotBadges* const m_slot_badges;

	size_t m_id = 0;
	UnitDef* m_def = nullptr;
	struct {
		types::Vec3 coords = {};
		bool is_rendered = false;
		size_t instance_id = 0;
		struct {
			sprite::Sprite* def = nullptr;
			size_t instance_id = 0;
			struct {
				sprite::Sprite* def = nullptr;
				size_t instance_id = 0;
			} healthbar;
			struct {
				util::Timer timer;
			} blink;
		} badge;
		struct {
			size_t instance_id = 0;
		} fake_badge;
	} m_render;

	const bool m_is_owned = false;
	bool m_is_active = false;
	backend::unit::movement_t m_movement = 0.0f;
	backend::unit::morale_t m_morale = 0;
	std::string m_morale_string = "";
	backend::unit::health_t m_health = 0;
	backend::unit::order_t m_order = backend::unit::order_t::NO_ORDERS;

	bool m_need_refresh = true;
	uint8_t m_fake_badge_offset = 0;

	const bool ShouldBeActive() const;

	render_data_t m_render_data = {};

	util::Scroller< types::Vec3 > m_mover;

	void UpdateMeshTex( meshtex_t& meshtex, const sprite::InstancedSprite* sprite );
};

}
}
}
