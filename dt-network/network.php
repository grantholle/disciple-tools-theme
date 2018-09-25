<?php
/**
 * Core functions to power the network features of Disciple Tools
 *
 * @class      Disciple_Tools_Notifications
 * @version    0.1.0
 * @since      0.1.0
 * @package    Disciple_Tools
 */

if ( !defined( 'ABSPATH' ) ) {
    exit; // Exit if accessed directly
}

class Disciple_Tools_Network {


    private static $_instance = null;
    public static function instance() {
        if ( is_null( self::$_instance ) ) {
            self::$_instance = new self();
        }
        return self::$_instance;
    }

    public function __construct() {

        if ( is_admin() ) {

            add_action( 'admin_menu', [ $this, 'meta_box_setup' ], 20 );
            add_filter( "dt_custom_fields_settings", [ $this, 'saturation_field_filter' ], 1, 2 );

            add_filter( 'site_link_type', [ $this, 'saturation_mapping_site_link_type' ], 10, 1 );
            add_filter( 'site_link_type_capabilities', [ $this, 'dt_saturation_mapping_site_link_capabilities' ], 10, 2 );

        }
    }

    /**
     * @see /dt-core/admin/menu/tabs/tab-network.php for the page shell
     */
    public static function admin_network_enable_box() {
        if ( isset( $_POST['network_nonce'] ) && wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['network_nonce'] ) ), 'network'.get_current_user_id() ) && isset( $_POST['network_feature'] )) {
            update_option( 'dt_network_enabled', (int) sanitize_text_field( wp_unslash( $_POST['network_feature'] ) ), true );
        }
        $enabled = get_option( 'dt_network_enabled' );
        ?>

        <form method="post">
            <?php wp_nonce_field( 'network'.get_current_user_id(), 'network_nonce', false, true ) ?>
            <label for="network_feature">
                <?php esc_html_e( 'Network Extension' ) ?>
            </label>
            <select name="network_feature" id="network_feature">
                <option value="0" <?php echo $enabled ? '' : 'selected' ?>><?php esc_html_e( 'Disabled' ) ?></option>
                <option value="1" <?php echo $enabled ? 'selected' : '' ?>><?php esc_html_e( 'Enabled' ) ?></option>
            </select>
            <button type="submit"><?php esc_html_e( 'Save' ) ?></button>
        </form>

        <?php
    }

    public static function admin_site_link_box() {
        global $wpdb;

        $site_links = $wpdb->get_results( "
        SELECT p.ID, p.post_title, pm.meta_value as type
            FROM wp_4_posts as p
              LEFT JOIN wp_4_postmeta as pm
              ON p.ID=pm.post_id
              AND meta_key = 'type'
            WHERE p.post_type = 'site_link_system'
              AND p.post_status = 'publish'
        ", ARRAY_A );

        if ( ! is_array( $site_links ) ) {
            echo 'No Site to Site links found. Go to <a href="'. esc_url( admin_url() ).'edit.php?post_type=site_link_system">Site Links</a> and create a site link, and then select "Network Report" as the type."';
        }

        echo '<h2>Reporting to these Networks</h2>';
        foreach ( $site_links as $site ) {
            if ( ! is_null( $site['type'] ) && 'Network Reporting' === $site['type'] ) {
                echo '<dd><a href="'. esc_url( admin_url() ) .'post.php?post='. esc_attr( $site['ID'] ).'&action=edit">' . esc_html( $site['post_title'] ) . '</a></dd>';
            }
        }

        echo '<h2>Other Connected Sites</h2>';
        foreach ( $site_links as $site ) {
            if ( 'Network Reporting' != $site['type'] ) {
                echo '<dd><a href="'. esc_url( admin_url() ) .'post.php?post='. esc_attr( $site['ID'] ).'&action=edit">' . esc_html( $site['post_title'] ) . '</a></dd>';
            }
        }

        echo '<hr><p style="font-size:.8em;">Note: Network Dashboards are Site Links that have the "Connection Type" of "Network Reporting".</p>';
    }

    public static function admin_locations_gname_installed_box() {
        // @codingStandardsIgnoreLine
        echo self::load_current_locations();
    }

    public function saturation_mapping_site_link_type( $type ) {
        $type[] = 'Network Reporting';
        return $type;
    }

    public function saturation_mapping_site_link_capabilities( $connection_type, $capabilities ) {
        if ( 'Network Reports' === $connection_type ) {
            $capabilities[] = 'network_reports';
        }
        return $capabilities;
    }

    public static function load_current_locations() {
        global $wpdb;

        $query = $wpdb->get_results("
            SELECT
                  a.ID as id,
                  a.post_parent as parent_id,
                  a.post_title as name
                FROM $wpdb->posts as a
                WHERE a.post_status = 'publish'
                AND a.post_type = 'locations'
            ", ARRAY_A );


        // prepare special array with parent-child relations
        $menu_data = array(
            'items' => array(),
            'parents' => array()
        );

        foreach ( $query as $menu_item )
        {
            $menu_data['items'][$menu_item['id']] = $menu_item;
            $menu_data['parents'][$menu_item['parent_id']][] = $menu_item['id'];
        }

        // output the menu
        return self::build_tree( 0, $menu_data, -1 );

    }

    public static function build_tree( $parent_id, $menu_data, $gen) {
        $html = '';

        if (isset( $menu_data['parents'][$parent_id] ))
        {
            $gen++;
            foreach ($menu_data['parents'][$parent_id] as $item_id)
            {
                if ( $gen >= 1 ) {
                    for ($i = 0; $i < $gen; $i++ ) {
                        $html .= '-- ';
                    }
                }
                $html .= '<a href="'. esc_url( admin_url() ) . 'post.php?post=' . esc_attr( $menu_data['items'][$item_id]['id'] ) .'&action=edit">' . esc_attr( $menu_data['items'][$item_id]['name'] ) . '</a><br>';

                // find childitems recursively
                $html .= self::build_tree( $item_id, $menu_data, $gen );
            }
        }
        return $html;
    }

    public function meta_box_setup() {
        add_meta_box( 'location_network_box', __( 'Network Dashboard Fields', 'disciple_tools' ), [ $this, 'load_mapping_meta_box' ], 'locations', 'normal', 'high' );
    }

    public function saturation_field_filter( $fields, $post_type ) {
        if ( 'locations' === $post_type ) {
            $fields['gn_geonameid'] = [
                'name'        => 'GeoNames ID ',
                'description' => __( 'Geoname ID is the unique global id for this location or its nearest known location. This is usually supplied by the Network Dashboard, but can be overwritten by clicking "edit"' ),
                'type'        => 'locked',
                'default'     => '',
                'section'     => 'saturation_mapping',
            ];
            $fields['gn_population'] = [
                'name'        => 'Population',
                'description' => __( 'Population for this location' ),
                'type'        => 'number',
                'default'     => 0,
                'section'     => 'saturation_mapping',
            ];
        }
        return $fields;
    }

    public function load_mapping_meta_box() {
        Disciple_Tools_Location_Post_Type::instance()->meta_box_content( 'saturation_mapping' );
    }

    /**
     * Returns array of locations and counts of groups
     * This does not distinguish between types of groups.
     * The array contains 'location' and 'count' fields.
     *
     * @return array|null|object
     */
    public function get_child_groups() {
        // get the groups and child groups of the location
        global $wpdb;
        return $wpdb->get_results( "SELECT p2p_to as location, count(p2p_id) as count FROM $wpdb->p2p WHERE p2p_type = 'groups_to_locations' GROUP BY p2p_to", ARRAY_A );
    }

    public function get_child_populations() {
        global $post_id;

        if ( empty( $post_id ) ) {
            return 0;
        }

        // Set up the objects needed
        $my_wp_query = new WP_Query();
        $all_wp_pages = $my_wp_query->query( array(
            'post_type' => 'locations',
            'posts_per_page' => '-1'
        ) );

        $children = get_page_children( $post_id, $all_wp_pages );

        return $children;
    }

}
Disciple_Tools_Network::instance();