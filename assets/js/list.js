(function($, wpApiSettings) {
  "use strict";
  let items; // contacts or groups
  let filterFunctions = [];
  let dataTable;

  const templates = {
    contacts: _.template(`<tr>
      <td><img src="<%- template_directory_uri %>/assets/images/star.svg" width=13 height=12></td>
      <td>
        <a href="<%- permalink %>"><%- post_title %></a>
        <br>
        <%- phone_numbers.join(", ") %>
      </td>
      <td><span class="status status--<%- overall_status %>"><%- status %></td>
      <td>
        <span class="milestone milestone--<%- sharing_milestone_key %>"><%- sharing_milestone %></span>
        <br>
        <span class="milestone milestone--<%- belief_milestone_key %>"><%- belief_milestone %></span>
      </td>
      <td><%- assigned_to ? assigned_to.name : "" %></td>
      <td><%= locations.join(", ") %></td>
      <td><%= group_links %></td>
      <td><%- last_modified %></td>
    </tr>`),
    groups: _.template(`<tr>
      <td></td>
      <td><a href="<%- permalink %>"><%- post_title %></a></td>
      <td><%- yeses.join(", ") %></td>
      <td style="text-align: right"><%- member_count %></td>
      <td><%= leader_links %></td>
      <td><%- locations.join(", ") %></td>
    </tr>`),
  };

  $.ajax({
    url: wpApiSettings.root + "dt-hooks/v1/" + wpApiSettings.current_post_type,
    beforeSend: function(xhr) {
      xhr.setRequestHeader('X-WP-Nonce', wpApiSettings.nonce);
    },
    success: function(data) {
      const statusNames = wpApiSettings.contacts_custom_fields_settings.overall_status.default;
      items = data;
      $(function() {
        displayRows();
        setUpFilterPane();
        $(".js-priorities-show").on("click", function(e) {
          priorityShow($(this).data("priority"));
          e.preventDefault();
        });
        $(".js-clear-filters").on("click", function() {
          clearFilters();
        });
        $(".js-my-contacts").on("click", function() {
          showMyContacts();
        });
        $(".js-sort-by").on("click", function() {
          sortBy(parseInt($(this).data("column-index")));
        });
      });
    },
    error: function(jqXHR, textStatus, errorThrown) {
      $(function() {
        $(".js-list-loading > td").html(
            "<div>" + wpApiSettings.txt_error + "</div>" +
            "<div>" + jqXHR.responseText + "</div>"
        );
      });
    },
  });

  function sortBy(columnIndex) {
    const currentOrder = dataTable.order();
    let ascending = true;
    if (currentOrder[0][0] === columnIndex) {
      if (currentOrder[0][1] === "asc") {
        ascending = false;
      }
    }
    dataTable.order([[columnIndex, ascending ? "asc" : "desc"]]);
    dataTable.draw();
    updateSortModal();
  }


  function displayRows() {
    const $table = $(".js-list");
    if (! $table.length) {
      return;
    }
    $table.find("> tbody").empty();
    _.forEach(items, function(item, index) {
      if (wpApiSettings.current_post_type === "contacts") {
        $table.append(buildContactRow(item, index));
      } else if (wpApiSettings.current_post_type === "groups") {
        $table.append(buildGroupRow(item, index));
      }
    });
    $.fn.dataTable.ext.search.push(function(settings, data, dataIndex) {
      const item = items[dataIndex];
      return _.every(filterFunctions, function(filterFunction) { return filterFunction(item); });
    });
    const dataTableOptions = {
      responsive: true,
      iDisplayLength: 100,
      bLengthChange: false,
      sDom: 'fir<"js-list-toolbar">tlp<"clearfix">',
        /* f: filtering input
         * i: information
         * r: processing
         * <"js-list-toolbar"> div with class toolbar
         * t: table
         * l: length changing
         * p: pagination
         * <"clearfix"> div with class clearfix
         */
      initComplete: function() {
        if ($(".js-list-sort-by-modal").length) {
          $(".js-list-toolbar")
            .append(
              $('<button class="button small">Sort by...</button>')
                .css("margin-bottom", "0")
                .on("click", showSortModal)
            )
            .css("margin", "0 10px")
            .css("float", "right");
        }
        $(".dataTables_info").css("display", "inline");
      },
    };
    if (wpApiSettings.current_post_type == "contacts") {
      _.assign(dataTableOptions, {
        columnDefs: [
          { targets: [0], width: "2%" },
          { targets: [1], width: "30%", },
          { targets: [2], width: "5%", },
          {
            // Hide the last modified column, it's only used for sorting
            targets: [7],
            visible: false,
            searchable: false,
          },
        ],
        order: [[7, 'desc']],
        autoWidth: false,
      });
    } else if (wpApiSettings.current_post_type === "groups") {
      _.assign(dataTableOptions, {
        columnDefs: [
          { targets: [0], width: "2%" },
          { targets: [1], width: "30%" },
          { targets: [2], width: "30%" },
          { targets: [3], width: "5%" },
        ],
        autoWidth: false,
      });
    }
    dataTable = $table.DataTable(dataTableOptions);
  }

  function buildContactRow(contact, index) {
    const template = templates[wpApiSettings.current_post_type];
    const ccfs = wpApiSettings.contacts_custom_fields_settings;
    const belief_milestone_key = _.find(
      ['baptizing', 'baptized', 'belief'],
      function(key) { return contact["milestone_" + key]; }
    );
    const sharing_milestone_key = _.find(
      ['planting', 'in_group', 'sharing', 'can_share'],
      function(key) { return contact["milestone_" + key]; }
    );
    let status = "";
    if (contact.overall_status === "active") {
      status = ccfs.seeker_path.default[contact.seeker_path];
    } else {
      status = ccfs.overall_status.default[contact.overall_status];
    }
    const group_links = _.map(contact.groups, function(group) {
        return '<a href="' + _.escape(group.permalink) + '">' + _.escape(group.post_title) + "</a>";
      }).join(", ");
    const context = _.assign({last_modified: 0}, contact, wpApiSettings, {
      index,
      status,
      belief_milestone_key,
      sharing_milestone_key,
      belief_milestone: (ccfs["milestone_" + belief_milestone_key] || {}).name || "",
      sharing_milestone: (ccfs["milestone_" + sharing_milestone_key] || {}).name || "",
      group_links,
    });
    context.assigned_to = context.assigned_to;
    return $.parseHTML(template(context));
  }

  function buildGroupRow(group, index) {
    const template = templates[wpApiSettings.current_post_type];
    const leader_links = _.map(group.leaders, function(leader) {
      return '<a href="' + _.escape(leader.permalink) + '">' + _.escape(leader.post_title) + "</a>";
    }).join(", ");
    const yeses = _.filter([
      'church_baptism', 'church_bible', 'church_communion',
      'church_fellowship', 'church_tithe', 'church_prayer', 'church_praise',
      'church_sharing', 'church_leaders', 'is_church',
    ], function(k) { return _.get(group, k); });
    const context = _.assign({}, group, {
      leader_links,
      yeses,
    });
    return $.parseHTML(template(context));
  }

  function showSortModal() {
    updateSortModal();
    $(".js-list-sort-by-modal").foundation('open');
  }

  function updateSortModal() {
    const currentOrder = dataTable.order();
    const templateDirectoryUri = wpApiSettings.template_directory_uri;
    $(".js-sort-by").each(function() {
      let sort = 'both';
      if (currentOrder[0][0] === parseInt($(this).data("column-index"))) {
        sort = currentOrder[0][1];
      }
      $(this)
        .css(
          "background-image",
          `url("${templateDirectoryUri}/vendor/DataTables/DataTables-1.10.15/images/sort_${sort}.png")`
        )
        .css("background-position", "100% 50%")
        .css("background-repeat", "no-repeat")
        .css("padding-right", "18px");
    });
  }

  function setUpFilterPane() {
    if (! $(".js-list").length) {
      return;
    }
    if (wpApiSettings.current_post_type !== "contacts") {
      return;
    }
    const contacts = items;
    const counts = {
      assigned_login: _.countBy(_(contacts).map('assigned_to.user_login').filter().value()),
      overall_status: _.countBy(_.map(contacts, 'overall_status')),
      locations: _.countBy(_.flatten(_.map(contacts, 'locations'))),
      seeker_path: _.countBy(contacts, 'seeker_path'),
      requires_update: _.countBy(contacts, 'requires_update'),
    };

    $(".js-contacts-filter :not(.js-contacts-filter-title)").remove();
    Object.keys(counts).forEach(function(filterType) {
      $(".js-contacts-filter[data-filter='" + filterType + "']")
        .append(createFilterCheckboxes(filterType, counts[filterType]));
    });
    $(".js-contacts-filter-title").on("click", function() {
      const $title = $(this);
      $title.parents(".js-contacts-filter").toggleClass("filter--closed");
    });
  }

  function createFilterCheckboxes(filterType, counts) {
    const $div = $("<div>");
    const ccfs = wpApiSettings.contacts_custom_fields_settings;
    Object.keys(counts).sort().forEach(function(key) {
      let humanText;
      if (filterType === 'seeker_path' || filterType === 'overall_status') {
        humanText = ccfs[filterType].default[key];
      } else if (filterType === 'requires_update') {
        humanText = key === "true" ? wpApiSettings.txt_yes : wpApiSettings.txt_no;
      } else {
        humanText = key;
      }
      $div.append(
        $("<div>").append(
          $("<label>")
            .css("cursor", "pointer")
            .addClass("js-filter-checkbox-label")
            .data("filter-type", filterType)
            .data("filter-value", key)
            .append(
              $("<input>")
              .attr("type", "checkbox")
              .on("change", function() {
                updateFilterFunctions();
                updateButtonStates();
                dataTable.draw();
              })
            )
            .append(document.createTextNode(humanText))
            .append($("<span>")
              .css("float", "right")
              .append(document.createTextNode(counts[key]))
            )
        )
      );
    });
    if ($.isEmptyObject(counts)) {
      $div.append(
          document.createTextNode(wpApiSettings.txt_no_filters)
      );
    }
    return $div;
  }

  function updateButtonStates() {
    $(".js-clear-filters").prop("disabled", filterFunctions.length == 0);
  }

  function updateFilterFunctions() {
    filterFunctions = [];
    {
      const $checkedStatusLabels = $(".js-filter-checkbox-label")
        .filter(function() { return $(this).data("filter-type") === "overall_status"; })
        .filter(function() { return $(this).find("input[type=checkbox]")[0].checked; });

      if ($checkedStatusLabels.length > 0) {
        filterFunctions.push(function(contact) {
          return _.some($checkedStatusLabels, function(label) {
            return $(label).data("filter-value") === contact.overall_status;
          });
        });
      }
    }

    {
      const $checkedLocationsLabels = $(".js-filter-checkbox-label")
        .filter(function() { return $(this).data("filter-type") === "locations"; })
        .filter(function() { return $(this).find("input[type=checkbox]")[0].checked; });

      if ($checkedLocationsLabels.length > 0) {
        filterFunctions.push(function(contact) {
          return _.some($checkedLocationsLabels, function(label) {
            return _.includes(contact.locations, $(label).data("filter-value"));
          });
        });
      }
    }

    {
      const $checkedAssignedLabels = $(".js-filter-checkbox-label")
        .filter(function() { return $(this).data("filter-type") === "assigned_login"; })
        .filter(function() { return $(this).find("input[type=checkbox]")[0].checked; });

      if ($checkedAssignedLabels.length > 0) {
        filterFunctions.push(function(contact) {
          return _.some($checkedAssignedLabels, function(label) {
            return $(label).data("filter-value") === _.get(contact, "assigned_to.user_login");
          });
        });
      }
    }

    {
      const $checkedSeekerPathLabels = $(".js-filter-checkbox-label")
        .filter(function() { return $(this).data("filter-type") === "seeker_path"; })
        .filter(function() { return $(this).find("input[type=checkbox]")[0].checked; });

      if ($checkedSeekerPathLabels.length > 0) {
        filterFunctions.push(function(contact) {
          return _.some($checkedSeekerPathLabels, function(label) {
            return $(label).data("filter-value") === contact.seeker_path;
          });
        });
      }
    }

    {
      const $checkedRequiresUpdateLabels = $(".js-filter-checkbox-label")
        .filter(function() { return $(this).data("filter-type") === "requires_update"; })
        .filter(function() { return $(this).find("input[type=checkbox]")[0].checked; });

      if ($checkedRequiresUpdateLabels.length > 0) {
        filterFunctions.push(function(contact) {
          return _.some($checkedRequiresUpdateLabels, function(label) {
            const value = $(label).data("filter-value") === "true";
            return value === contact.requires_update;
          });
        });
      }
    }

  }

  function priorityShow(priority) {
    $(".js-filter-checkbox-label input[type=checkbox]").each(function() {
      this.checked = false;
    });
    tickFilters("assigned_login", wpApiSettings.current_user_login);
    tickFilters("overall_status", "active");

    if (priority === "update_needed") {
      tickFilters("requires_update", "true");
    } else if (priority === "meeting_scheduled") {
      tickFilters("seeker_path", "scheduled");
    } else if (priority === "contact_unattempted") {
      tickFilters("seeker_path", "none");
    } else {
      throw new Error("Priority not recognized: " + priority);
    }

    updateFilterFunctions();
    updateButtonStates();
    dataTable.draw();
  }

  function showMyContacts() {
    $(".js-filter-checkbox-label input[type=checkbox]").each(function() {
      this.checked = false;
    });
    tickFilters("assigned_login", wpApiSettings.current_user_login);
    updateFilterFunctions();
    updateButtonStates();
    dataTable.draw();
  }

  function tickFilters(filterType, filterValue) {
    $(".js-filter-checkbox-label")
      .filter(function() { return $(this).data("filter-type") == filterType; })
      .each(function() {
        if ($(this).data("filter-value") === filterValue) {
          $(this).find("input[type=checkbox]")[0].checked = true;
        }
      });
    $(".js-contacts-filter[data-filter=" + filterType + "]").removeClass("filter--closed");
  }

  function clearFilters() {
    $(".js-filter-checkbox-label input[type=checkbox]").each(function() {
      this.checked = false;
    });
    updateFilterFunctions();
    updateButtonStates();
    dataTable.draw();
  }


})(window.jQuery, window.wpApiSettings);