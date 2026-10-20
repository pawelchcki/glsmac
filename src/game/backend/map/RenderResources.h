#pragma once

#include <atomic>

namespace types::mesh { class Render; class Data; }
namespace types::texture { class Texture; }

namespace game::backend::map {

// Frontend retains ownership of the actual resources. Access is revoked under
// Graphics::NoRender before it destroys them, so backend edits cannot outlive
// the visible map. Pointers stay immutable after publication.
struct RenderResources {
	types::mesh::Render* terrain = nullptr;
	types::mesh::Data* terrain_data = nullptr;
	types::texture::Texture* texture = nullptr;
	std::atomic< bool > active { false };
};

}
