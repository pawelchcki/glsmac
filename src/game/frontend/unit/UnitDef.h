#pragma once

#if defined( DEBUG ) || defined( FASTDEBUG )
namespace gse::tests::mocks { struct UnitBodyCensusFixture; }
#endif

#include <string>
#include <unordered_map>

#include "game/backend/unit/Types.h"

#include "types/Vec3.h"
// TODO: remove?
#include "game/frontend/sprite/Sprite.h"

namespace types {
namespace texture {
class Texture;
}
}

namespace game::backend::unit {
class Def;
}

namespace game {
namespace frontend {

namespace sprite {
class InstancedSpriteManager;
}

namespace unit {

class UnitDef {
public:
	UnitDef( sprite::InstancedSpriteManager* ism, const backend::unit::Def* unitdef );
	~UnitDef();

	const bool IsArtillery() const;

	sprite::Sprite* GetSprite( const backend::unit::morale_t morale );
	const std::string& GetIdForObservation() const { return m_id; }
	const sprite::Sprite* GetCachedSpriteForObservation( const backend::unit::morale_t morale ) const {
		if ( m_type != backend::unit::DT_STATIC || !static_.render.is_sprite ) { return nullptr; }
		if ( m_render.morale_based_xshift ) {
			if ( !static_.render.morale_based_sprites ) { return nullptr; }
			const auto found = static_.render.morale_based_sprites->find( morale );
			return found != static_.render.morale_based_sprites->end() && found->second.instanced_sprite ? &found->second : nullptr;
		}
		return static_.render.sprite.instanced_sprite ? &static_.render.sprite : nullptr;
	}
	size_t GetCachedSpriteCountForObservation() const {
		if ( m_type != backend::unit::DT_STATIC || !static_.render.is_sprite ) { return 0; }
		if ( m_render.morale_based_xshift ) { return static_.render.morale_based_sprites ? static_.render.morale_based_sprites->size() : 0; }
		return static_.render.sprite.instanced_sprite ? 1 : 0;
	}

	const bool IsImmovable() const;

	const std::string GetNameString() const;
	const std::string GetStatsString() const;

private:
#if defined( DEBUG ) || defined( FASTDEBUG )
	friend struct ::gse::tests::mocks::UnitBodyCensusFixture;
#endif

	sprite::InstancedSpriteManager* const m_ism;

	backend::unit::sprite_render_info_t m_render = {};

	std::string m_id;
	std::string m_name;
	backend::unit::def_type_t m_type;

	typedef std::unordered_map< backend::unit::morale_t, sprite::Sprite > morale_based_sprites_t;

	struct {
		backend::unit::movement_type_t movement_type;
		backend::unit::movement_t movement_per_turn;
		struct {
			bool is_sprite = false;
			types::texture::Texture* texture = nullptr;
			sprite::Sprite sprite = {};
			morale_based_sprites_t* morale_based_sprites = nullptr;
		} render = {};
	} static_ = {};

	types::texture::Texture* GetSpriteTexture();
};

}
}
}
