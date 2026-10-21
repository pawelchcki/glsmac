#pragma once

#include <string>
#include <vector>

#include "types/Vec3.h"
#include "types/Color.h"

namespace game {
namespace frontend {

namespace sprite {
class InstancedSprite;
class InstancedSpriteManager;
}

namespace text {

class InstancedFont;

class InstancedText {
public:
	InstancedText( const std::string& text, InstancedFont* font, const types::Color& color, const types::Color& shadow_color );
	~InstancedText();

	void ShowAt( const types::Vec3& coords );
	void Hide();
	const std::string& GetText() const { return m_text; }
	size_t GetSymbolCount() const { return m_text_sprites.size(); }
	size_t GetInstanceCount() const { return m_instance_ids.size(); }

private:
	const std::string m_text = "";
	std::vector< sprite::InstancedSprite* > m_text_sprites = {};
	std::vector< size_t > m_instance_ids = {};
	std::vector< types::Vec2< float > > m_offsets = {};

};

}
}
}
