const express = require('express');
const router = express.Router();
const db = require('../db/init');
const { isAdmin } = require('../middleware/auth');

// Helper function to generate slug from title
function generateSlug(title) {
    return title
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim('-');
}

// Helper function to update category post counts
function updateCategoryPostCount(categoryId) {
    db.run(`
        UPDATE blog_categories 
        SET post_count = (
            SELECT COUNT(*) FROM blog_posts 
            WHERE category_id = ? AND status = 'published'
        ) 
        WHERE id = ?
    `, [categoryId, categoryId]);
}

// Helper function to update tag post counts
function updateTagPostCount(tagId) {
    db.run(`
        UPDATE blog_tags 
        SET post_count = (
            SELECT COUNT(*) FROM blog_post_tags bpt
            JOIN blog_posts bp ON bpt.post_id = bp.id
            WHERE bpt.tag_id = ? AND bp.status = 'published'
        ) 
        WHERE id = ?
    `, [tagId, tagId]);
}

// ============================================================================
// PUBLIC BLOG ROUTES (SEO OPTIMIZED)
// ============================================================================

// Blog homepage
router.get('/', (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = 12;
    const offset = (page - 1) * limit;

    // Get published posts with author and category info
    db.all(`
        SELECT 
            bp.*,
            u.username as author_name,
            bc.name as category_name,
            bc.slug as category_slug
        FROM blog_posts bp
        JOIN users u ON bp.author_id = u.id
        LEFT JOIN blog_categories bc ON bp.category_id = bc.id
        WHERE bp.status = 'published'
        ORDER BY bp.published_at DESC, bp.created_at DESC
        LIMIT ? OFFSET ?
    `, [limit, offset], (err, posts) => {
        if (err) {
            console.error('Error fetching blog posts:', err);
            return res.status(500).render('error', {
                title: 'Error - Goal Tracker',
                error: 'Failed to load blog posts'
            });
        }

        // Get total post count for pagination
        db.get(`
            SELECT COUNT(*) as total 
            FROM blog_posts 
            WHERE status = 'published'
        `, (err, countResult) => {
            if (err) {
                console.error('Error counting blog posts:', err);
                return res.status(500).render('error', {
                    title: 'Error - Goal Tracker',
                    error: 'Failed to load blog'
                });
            }

            const totalPosts = countResult.total;
            const totalPages = Math.ceil(totalPosts / limit);

            // Get categories for sidebar
            db.all(`
                SELECT * FROM blog_categories 
                WHERE post_count > 0 
                ORDER BY name ASC
            `, (err, categories) => {
                if (err) {
                    console.error('Error fetching categories:', err);
                    categories = [];
                }

                // Get recent posts for sidebar
                db.all(`
                    SELECT id, title, slug, published_at 
                    FROM blog_posts 
                    WHERE status = 'published' 
                    ORDER BY published_at DESC 
                    LIMIT 5
                `, (err, recentPosts) => {
                    if (err) {
                        console.error('Error fetching recent posts:', err);
                        recentPosts = [];
                    }

                    res.render('blog/index', {
                        title: 'Developer Blog - Goal Tracker',
                        metaDescription: 'Insights, tutorials, and updates from the Goal Tracker development team. Learn about goal achievement, productivity tips, and technical deep dives.',
                        canonicalUrl: `https://goaltracker.com/blog`,
                        posts,
                        categories,
                        recentPosts,
                        currentPage: page,
                        totalPages,
                        hasNextPage: page < totalPages,
                        hasPrevPage: page > 1,
                        nextPage: page + 1,
                        prevPage: page - 1
                    });
                });
            });
        });
    });
});

// Individual blog post
router.get('/post/:slug', (req, res) => {
    const slug = req.params.slug;

    // Get the blog post with author and category info
    db.get(`
        SELECT 
            bp.*,
            u.username as author_name,
            bc.name as category_name,
            bc.slug as category_slug
        FROM blog_posts bp
        JOIN users u ON bp.author_id = u.id
        LEFT JOIN blog_categories bc ON bp.category_id = bc.id
        WHERE bp.slug = ? AND bp.status = 'published'
    `, [slug], (err, post) => {
        if (err) {
            console.error('Error fetching blog post:', err);
            return res.status(500).render('error', {
                title: 'Error - Goal Tracker',
                error: 'Failed to load blog post'
            });
        }

        if (!post) {
            return res.status(404).render('error', {
                title: 'Post Not Found - Goal Tracker',
                error: 'The blog post you are looking for could not be found.'
            });
        }

        // Increment view count
        db.run('UPDATE blog_posts SET view_count = view_count + 1 WHERE id = ?', [post.id]);

        // Get tags for this post
        db.all(`
            SELECT bt.name, bt.slug 
            FROM blog_tags bt
            JOIN blog_post_tags bpt ON bt.id = bpt.tag_id
            WHERE bpt.post_id = ?
        `, [post.id], (err, tags) => {
            if (err) {
                console.error('Error fetching post tags:', err);
                tags = [];
            }

            // Get related posts
            db.all(`
                SELECT id, title, slug, excerpt, published_at
                FROM blog_posts 
                WHERE status = 'published' 
                AND id != ? 
                AND (category_id = ? OR category_id IS NULL)
                ORDER BY published_at DESC 
                LIMIT 3
            `, [post.id, post.category_id], (err, relatedPosts) => {
                if (err) {
                    console.error('Error fetching related posts:', err);
                    relatedPosts = [];
                }

                res.render('blog/post', {
                    title: post.meta_title || post.title,
                    metaDescription: post.meta_description || post.excerpt,
                    metaKeywords: post.meta_keywords,
                    canonicalUrl: `https://goaltracker.com/blog/post/${post.slug}`,
                    post,
                    tags,
                    relatedPosts,
                    publishedDate: new Date(post.published_at).toLocaleDateString('en-GB', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                    })
                });
            });
        });
    });
});

// Category page
router.get('/category/:slug', (req, res) => {
    const categorySlug = req.params.slug;
    const page = parseInt(req.query.page) || 1;
    const limit = 12;
    const offset = (page - 1) * limit;

    // Get category info
    db.get(`
        SELECT * FROM blog_categories WHERE slug = ?
    `, [categorySlug], (err, category) => {
        if (err || !category) {
            return res.status(404).render('error', {
                title: 'Category Not Found - Goal Tracker',
                error: 'The category you are looking for could not be found.'
            });
        }

        // Get posts in this category
        db.all(`
            SELECT 
                bp.*,
                u.username as author_name
            FROM blog_posts bp
            JOIN users u ON bp.author_id = u.id
            WHERE bp.category_id = ? AND bp.status = 'published'
            ORDER BY bp.published_at DESC
            LIMIT ? OFFSET ?
        `, [category.id, limit, offset], (err, posts) => {
            if (err) {
                console.error('Error fetching category posts:', err);
                return res.status(500).render('error', {
                    title: 'Error - Goal Tracker',
                    error: 'Failed to load category posts'
                });
            }

            const totalPages = Math.ceil(category.post_count / limit);

            res.render('blog/category', {
                title: category.meta_title || `${category.name} - Goal Tracker Blog`,
                metaDescription: category.meta_description || category.description,
                canonicalUrl: `https://goaltracker.com/blog/category/${category.slug}`,
                category,
                posts,
                currentPage: page,
                totalPages,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1,
                nextPage: page + 1,
                prevPage: page - 1
            });
        });
    });
});

// ============================================================================
// ADMIN BLOG MANAGEMENT ROUTES
// ============================================================================

// Admin blog dashboard
router.get('/admin', isAdmin, (req, res) => {
    // Get blog statistics
    db.all(`
        SELECT 
            COUNT(*) as total_posts,
            COUNT(CASE WHEN status = 'published' THEN 1 END) as published_posts,
            COUNT(CASE WHEN status = 'draft' THEN 1 END) as draft_posts,
            SUM(view_count) as total_views
        FROM blog_posts
    `, (err, stats) => {
        if (err) {
            console.error('Error fetching blog stats:', err);
            stats = [{ total_posts: 0, published_posts: 0, draft_posts: 0, total_views: 0 }];
        }

        // Get recent posts
        db.all(`
            SELECT 
                bp.*,
                u.username as author_name,
                bc.name as category_name
            FROM blog_posts bp
            JOIN users u ON bp.author_id = u.id
            LEFT JOIN blog_categories bc ON bp.category_id = bc.id
            ORDER BY bp.updated_at DESC
            LIMIT 10
        `, (err, recentPosts) => {
            if (err) {
                console.error('Error fetching recent posts:', err);
                recentPosts = [];
            }

            // Get categories
            db.all('SELECT * FROM blog_categories ORDER BY name ASC', (err, categories) => {
                if (err) {
                    console.error('Error fetching categories:', err);
                    categories = [];
                }

                res.render('admin/blog', {
                    title: 'Blog Management - Admin',
                    stats: stats[0],
                    recentPosts,
                    categories,
                    user: req.session.user
                });
            });
        });
    });
});

// Create new blog post
router.post('/admin/posts', isAdmin, (req, res) => {
    const {
        title, content, excerpt, category_id, status, meta_title, 
        meta_description, meta_keywords, is_featured, tags
    } = req.body;

    if (!title || !content) {
        return res.status(400).json({ error: 'Title and content are required' });
    }

    const slug = generateSlug(title);
    const authorId = req.session.user.id;
    const publishedAt = status === 'published' ? new Date().toISOString() : null;

    // Insert blog post
    db.run(`
        INSERT INTO blog_posts 
        (title, slug, content, excerpt, author_id, category_id, status, 
         meta_title, meta_description, meta_keywords, is_featured, published_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [title, slug, content, excerpt, authorId, category_id || null, status,
        meta_title, meta_description, meta_keywords, is_featured === 'on' ? 1 : 0, publishedAt],
    function(err) {
        if (err) {
            console.error('Error creating blog post:', err);
            return res.status(500).json({ error: 'Failed to create blog post' });
        }

        const postId = this.lastID;

        // Handle tags if provided
        if (tags && tags.trim()) {
            const tagNames = tags.split(',').map(tag => tag.trim()).filter(tag => tag);
            
            tagNames.forEach(tagName => {
                const tagSlug = generateSlug(tagName);
                
                // Insert or get tag
                db.run(`
                    INSERT OR IGNORE INTO blog_tags (name, slug) VALUES (?, ?)
                `, [tagName, tagSlug], function(err) {
                    if (!err) {
                        // Get tag ID and link to post
                        db.get('SELECT id FROM blog_tags WHERE slug = ?', [tagSlug], (err, tag) => {
                            if (!err && tag) {
                                db.run(`
                                    INSERT OR IGNORE INTO blog_post_tags (post_id, tag_id) 
                                    VALUES (?, ?)
                                `, [postId, tag.id], (err) => {
                                    if (!err) updateTagPostCount(tag.id);
                                });
                            }
                        });
                    }
                });
            });
        }

        // Update category post count
        if (category_id && status === 'published') {
            updateCategoryPostCount(category_id);
        }

        res.json({ success: true, postId });
    });
});

// Update blog post
router.put('/admin/posts/:id', isAdmin, (req, res) => {
    const postId = req.params.id;
    const {
        title, content, excerpt, category_id, status, meta_title,
        meta_description, meta_keywords, is_featured, tags
    } = req.body;

    if (!title || !content) {
        return res.status(400).json({ error: 'Title and content are required' });
    }

    const slug = generateSlug(title);
    const wasPublished = status === 'published';
    const publishedAt = wasPublished ? new Date().toISOString() : null;

    // Get current post to check if status changed
    db.get('SELECT status, category_id FROM blog_posts WHERE id = ?', [postId], (err, currentPost) => {
        if (err || !currentPost) {
            return res.status(404).json({ error: 'Post not found' });
        }

        // Update blog post
        db.run(`
            UPDATE blog_posts SET
            title = ?, slug = ?, content = ?, excerpt = ?, category_id = ?, 
            status = ?, meta_title = ?, meta_description = ?, meta_keywords = ?, 
            is_featured = ?, published_at = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [title, slug, content, excerpt, category_id || null, status,
            meta_title, meta_description, meta_keywords, is_featured === 'on' ? 1 : 0, 
            publishedAt, postId], (err) => {
            if (err) {
                console.error('Error updating blog post:', err);
                return res.status(500).json({ error: 'Failed to update blog post' });
            }

            // Update category post counts if category or status changed
            if (currentPost.category_id && currentPost.category_id != category_id) {
                updateCategoryPostCount(currentPost.category_id);
            }
            if (category_id) {
                updateCategoryPostCount(category_id);
            }

            res.json({ success: true });
        });
    });
});

// Delete blog post
router.delete('/admin/posts/:id', isAdmin, (req, res) => {
    const postId = req.params.id;

    // Get post info for cleanup
    db.get('SELECT category_id FROM blog_posts WHERE id = ?', [postId], (err, post) => {
        if (err || !post) {
            return res.status(404).json({ error: 'Post not found' });
        }

        // Delete post tags
        db.run('DELETE FROM blog_post_tags WHERE post_id = ?', [postId], (err) => {
            if (err) {
                console.error('Error deleting post tags:', err);
            }

            // Delete the post
            db.run('DELETE FROM blog_posts WHERE id = ?', [postId], (err) => {
                if (err) {
                    console.error('Error deleting blog post:', err);
                    return res.status(500).json({ error: 'Failed to delete blog post' });
                }

                // Update category post count
                if (post.category_id) {
                    updateCategoryPostCount(post.category_id);
                }

                res.json({ success: true });
            });
        });
    });
});

// Get single post for editing
router.get('/admin/posts/:id', isAdmin, (req, res) => {
    const postId = req.params.id;

    db.get(`
        SELECT 
            bp.*,
            GROUP_CONCAT(bt.name) as tags
        FROM blog_posts bp
        LEFT JOIN blog_post_tags bpt ON bp.id = bpt.post_id
        LEFT JOIN blog_tags bt ON bpt.tag_id = bt.id
        WHERE bp.id = ?
        GROUP BY bp.id
    `, [postId], (err, post) => {
        if (err) {
            console.error('Error fetching blog post:', err);
            return res.status(500).json({ error: 'Failed to fetch blog post' });
        }

        if (!post) {
            return res.status(404).json({ error: 'Post not found' });
        }

        res.json({ post });
    });
});

// Blog sitemap for SEO
router.get('/sitemap.xml', (req, res) => {
    res.set('Content-Type', 'application/xml');

    db.all(`
        SELECT slug, updated_at, published_at
        FROM blog_posts 
        WHERE status = 'published'
        ORDER BY published_at DESC
    `, (err, posts) => {
        if (err) {
            console.error('Error generating sitemap:', err);
            return res.status(500).send('<?xml version="1.0" encoding="UTF-8"?><urlset></urlset>');
        }

        let sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n';
        sitemap += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
        
        // Add blog homepage
        sitemap += '  <url>\n';
        sitemap += '    <loc>https://goaltracker.com/blog</loc>\n';
        sitemap += '    <changefreq>daily</changefreq>\n';
        sitemap += '    <priority>0.8</priority>\n';
        sitemap += '  </url>\n';

        // Add individual posts
        posts.forEach(post => {
            sitemap += '  <url>\n';
            sitemap += `    <loc>https://goaltracker.com/blog/post/${post.slug}</loc>\n`;
            sitemap += `    <lastmod>${new Date(post.updated_at).toISOString().split('T')[0]}</lastmod>\n`;
            sitemap += '    <changefreq>weekly</changefreq>\n';
            sitemap += '    <priority>0.6</priority>\n';
            sitemap += '  </url>\n';
        });

        sitemap += '</urlset>';
        res.send(sitemap);
    });
});

module.exports = router; 